// routes/uninstall.js
const express = require("express");
const crypto = require("crypto");
const axios = require("axios"); // only used if you try cleanup before token revocation (usually not possible)
const router = express.Router();
const Shop = require("../models/Shop");

const API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-04";
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;

// Verify Shopify webhook HMAC using the RAW body
function verifyShopifyWebhook(req) {
  const hmacHeader = req.get("X-Shopify-Hmac-Sha256") || "";
  const digest = crypto
    .createHmac("sha256", SHOPIFY_API_SECRET)
    .update(req.body) // req.body is a Buffer (because we use express.raw)
    .digest("base64");
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
}

// NOTE: This route MUST receive raw body (set in server.js)
router.post("/", async (req, res) => {
  try {
    if (!verifyShopifyWebhook(req)) {
      return res.sendStatus(401);
    }

    const shop = req.get("X-Shopify-Shop-Domain");
    if (!shop) return res.sendStatus(400);

    // Fetch the shop doc
    const doc = await Shop.findOne({ shop });

    // Try to delete ScriptTag if we still have a valid token (often token is already revoked)
    // Safe to skip; Shopify typically removes app-owned ScriptTags on uninstall.
    const scriptTagId = doc?.scriptTagId;
    const accessToken = doc?.accessToken;

    if (scriptTagId && accessToken) {
      try {
        await axios.delete(
          `https://${shop}/admin/api/${API_VERSION}/script_tags/${scriptTagId}.json`,
          { headers: { "X-Shopify-Access-Token": accessToken } }
        );
      } catch (e) {
        // Likely 401 because token is already revoked. That's OK.
        // console.warn("ScriptTag delete failed (expected post-uninstall):", e.response?.data || e.message);
      }
    }

    // Clean local data
    await Shop.updateOne(
      { shop },
      {
        $set: {
          installed: false,
          alertsUsedThisMonth: 0,
          alertLimitReached: false,
        },
        $unset: {
          accessToken: "",   // remove token
          scriptTagId: "",   // remove stored script tag id
        },
      }
    );

    // Acknowledge immediately so Shopify stops retrying
    return res.sendStatus(200);
  } catch (e) {
    console.error("Uninstall cleanup error:", e?.response?.data || e.message);
    // Always 200 to acknowledge the webhook
    return res.sendStatus(200);
  }
});

module.exports = router;
