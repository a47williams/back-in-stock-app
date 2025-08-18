// routes/alert.js
const express = require("express");
const router = express.Router();
const Alert = require("../models/Alert");
const Shop = require("../models/Shop");
const { getVariantInventoryId } = require("../utils/shopifyApi");

// helper: strip gid if theme sends gid://shopify/ProductVariant/123
function normalizeId(id) {
  if (!id) return null;
  const s = String(id);
  const m = s.match(/(\d+)$/);
  return m ? m[1] : s;
}

router.post("/register", express.json(), async (req, res) => {
  try {
    // 1) Prefer body.shop; fall back to header or .env (single-store dev)
    let shop =
      (req.body && req.body.shop) ||
      req.get('X-Shopify-Shop-Domain') ||
      process.env.SHOPIFY_SHOP || null;

    const productId = normalizeId(req.body?.productId);
    const variantId = normalizeId(req.body?.variantId);
    const phone     = (req.body?.phone || '').trim();

    if (!shop || !variantId || !phone) {
      return res.status(400).json({ error: "Missing shop, variantId or phone" });
    }

    // 2) Look up inventory_item_id for this variant
    const inventory_item_id = await getVariantInventoryId(shop, variantId);
    if (!inventory_item_id) {
      return res.status(400).json({ error: "No inventory_item_id found for this variant" });
    }

    // 3) Save / upsert alert
    await Alert.findOneAndUpdate(
      { shop, inventory_item_id, phone },
      { shop, inventory_item_id, phone, productId, variantId, sent: false },
      { upsert: true, new: true }
    );

    console.log("✅ Alert saved for", { shop, inventory_item_id, phone });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("❌ Error saving alert", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
