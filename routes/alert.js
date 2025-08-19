// routes/alert.js
const express = require("express");
const router = express.Router();
const Alert = require("../models/Alert");
const { getVariantInventoryId } = require("../utils/shopifyApi");

// POST /alerts/register
router.post("/register", express.json(), async (req, res) => {
  const { shop, productId, variantId, phone } = req.body || {};

  console.log("➡️  /alerts/register received", { shop, productId, variantId, phone });

  if (!shop || !productId || !variantId || !phone) {
    console.log("⛔ register missing fields:", { shop, productId, variantId, phone });
    return res.status(400).json({ error: "Missing required fields." });
  }

  let inventory_item_id = null;

  // Try to enrich with inventory_item_id, but DO NOT fail if it’s unavailable
  try {
    inventory_item_id = await getVariantInventoryId(shop, String(variantId));
  } catch (err) {
    console.warn("⚠️  getVariantInventoryId failed (continuing without it):", err?.message || err);
  }

  try {
    const doc = await Alert.findOneAndUpdate(
      { shop, variantId: String(variantId), phone },
      {
        shop,
        productId: String(productId),
        variantId: String(variantId),
        phone: String(phone),
        ...(inventory_item_id ? { inventory_item_id: String(inventory_item_id) } : {}),
        sent: false,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log("✅ Alert saved", {
      shop,
      productId,
      variantId,
      phone,
      inventory_item_id: inventory_item_id || null,
      id: doc?._id?.toString?.(),
    });

    return res.json({ success: true, id: doc?._id });
  } catch (err) {
    console.error("❌ Error saving alert", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
