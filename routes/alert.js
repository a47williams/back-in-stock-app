// routes/alert.js
const express = require("express");
const router = express.Router();
const Alert = require("../models/Alert");
const { getVariantInventoryId, getShopToken } = require("../utils/shopifyApi");

// POST /alerts/register
router.post("/register", express.json(), async (req, res) => {
  try {
    const { shop, productId, variantId, phone } = req.body || {};

    if (!shop || !productId || !variantId || !phone) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const token = await getShopToken(shop);
    if (!token) {
      return res
        .status(401)
        .json({ error: `No access token on file for shop ${shop}` });
    }

    const inventory_item_id = await getVariantInventoryId(shop, variantId);
    if (!inventory_item_id) {
      return res
        .status(400)
        .json({ error: "No inventory_item_id for this variant" });
    }

    const doc = await Alert.findOneAndUpdate(
      { shop, inventory_item_id, phone },
      {
        $set: {
          shop,
          productId: String(productId),
          variantId: String(variantId),
          inventory_item_id,
          phone,
          sent: false,
        },
      },
      { upsert: true, new: true }
    );

    console.log("✅ Alert saved", {
      shop,
      productId,
      variantId,
      phone,
      id: doc?._id?.toString(),
    });

    res.json({ success: true });
  } catch (err) {
    console.error("❌ Error saving alert", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Optional debug list (disable or protect in prod)
router.get("/debug/list", async (_req, res) => {
  const docs = await Alert.find().sort({ createdAt: -1 }).lean();
  res.json(docs);
});

module.exports = router;
