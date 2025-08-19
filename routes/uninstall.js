// routes/uninstall.js
const express = require("express");
const crypto = require("crypto");
const Shop = require("../models/Shop");
const Alert = require("../models/Alert");

const router = express.Router();

const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;

// Raw body needed for HMAC
const rawBodySaver = (req, res, buf) => {
  if (buf && buf.length) {
    req.rawBody = buf.toString("utf8");
  }
};

router.use(express.json({ verify: rawBodySaver }));

// Shopify HMAC verification
function verifyHmacFromHeader(req) {
  const shopifyHmac = req.get("x-shopify-hmac-sha256");
  if (!shopifyHmac || !req.rawBody) return false;

  const hash = crypto
    .createHmac("sha256", SHOPIFY_API_SECRET)
    .update(req.rawBody, "utf8")
    .digest("base64");

  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(shopifyHmac));
}

router.post("/uninstall", async (req, res) => {
  const shop = req.get("x-shopify-shop-domain");

  if (!verifyHmacFromHeader(req)) {
    return res.status(401).send("Invalid HMAC");
  }

  res.status(200).send("ok");

  try {
    console.log(`📦 App uninstalled by ${shop}`);

    // Remove alerts + shop record
    await Alert.deleteMany({ shop });
    await Shop.deleteOne({ shop });

    console.log(`✅ Cleaned up data for ${shop}`);
  } catch (err) {
    console.error("Uninstall cleanup failed:", err);
  }
});

module.exports = router;
