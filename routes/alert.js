// routes/alert.js
const express = require("express");
const router = express.Router();
const Alert = require("../models/Alert");
const Shop = require("../models/Shop");
const { getVariantInventoryId } = require("../utils/shopifyApi");

router.post("/register", express.json(), async (req, res) => {
  try {
    const { shop, productId, variantId, phone } = req.body;

    // 1. Look up the inventory_item_id for this variant
    const inventory_item_id = await getVariantInventoryId(shop, variantId);

    if (!inventory_item_id) {
      return res.status(400).json({ error: "No inventory_item_id found for this variant" });
    }

    // 2. Save or update alert
    await Alert.findOneAndUpdate(
      { shop, inventory_item_id, phone },
      {
        shop,
        inventory_item_id,
        phone,
        productId,
        variantId,
      },
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
router.get('/debug/list', async (_req, res) => {
  const docs = await Alert.find().lean();
  res.json(docs.map(d => ({
    shop: d.shop,
    variantId: d.variantId,
    inventory_item_id: d.inventory_item_id,
    phone: d.phone,
    sent: d.sent,
  })));
});
