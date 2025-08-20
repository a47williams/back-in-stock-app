// routes/alert.js
const express = require("express");
const crypto = require("crypto");
const router = express.Router();

const { dbReady } = require("../db");
const Alert = require("../models/Alert");
const Shop = require("../models/Shop");
const { getVariantInventoryId } = require("../utils/shopifyApi");

const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;

async function ensureDbReady() {
  try {
    await dbReady;
  } catch (err) {
    throw new Error(
      "database_unavailable: " + (err?.message || "could not connect")
    );
  }
}

// HMAC validation middleware
function verifyShopifyRequest(req, res, next) {
  const hmac = req.get("X-Shopify-Hmac-Sha256");
  if (!hmac || !SHOPIFY_API_SECRET) {
    return res.status(400).send("Missing HMAC or secret");
  }

  const rawBody = JSON.stringify(req.body);
  const hash = crypto
    .createHmac("sha256", SHOPIFY_API_SECRET)
    .update(rawBody, "utf8")
    .digest("base64");

  if (hash !== hmac) {
    return res.status(401).send("HMAC validation failed");
  }

  next();
}

router.post("/register", express.json(), verifyShopifyRequest, async (req, res) => {
  const started = Date.now();
  try {
    const { shop, productId, variantId, phone } = req.body || {};

    if (!shop || !variantId || !phone) {
      return res.status(400).json({
        ok: false,
        error: "missing_params",
        details: { shop: !!shop, variantId: !!variantId, phone: !!phone },
      });
    }

    await ensureDbReady();

    const shopDoc = await Shop.findOne({ shop }).lean();
    if (!shopDoc || !shopDoc.accessToken) {
      return res.status(400).json({
        ok: false,
        error: `No access token on file for shop ${shop}`,
      });
    }

    const inventory_item_id = await getVariantInventoryId(shop, variantId);
    if (!inventory_item_id) {
      return res
        .status(400)
        .json({ ok: false, error: "No inventory_item_id for this variant" });
    }

    const normalizedPhone = phone.startsWith("whatsapp:")
      ? phone
      : `whatsapp:${phone}`;

    await Alert.findOneAndUpdate(
      { shop, inventory_item_id, phone: normalizedPhone },
      {
        shop,
        inventory_item_id,
        phone: normalizedPhone,
        productId,
        variantId,
        sent: false,
        updatedAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log("✅ Alert saved", {
      shop,
      variantId,
      inventory_item_id,
      phone: normalizedPhone,
      ms: Date.now() - started,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("❌ Error saving alert", err?.stack || err);
    const msg =
      err?.message && err.message.startsWith("database_unavailable")
        ? err.message
        : "internal_error";
    return res.status(500).json({ ok: false, error: msg });
  }
});

module.exports = router;
