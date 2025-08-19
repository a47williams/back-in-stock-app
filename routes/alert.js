// routes/alert.js
const express = require("express");
const router = express.Router();
const Alert = require("../models/Alert");
const { isDBReady } = require("../utils/db");
const { getVariantInventoryId } = require("../utils/shopifyApi");

// POST /alerts/register
router.post("/register", express.json(), async (req, res) => {
  try {
    if (!isDBReady()) return res.status(503).json({ error: "Database unavailable, try again in a few seconds." });

    const { shop, productId, variantId, phone } = req.body || {};
    if (!shop || !productId || !variantId || !phone) {
      return res.status(400).json({ error: "Missing shop, productId, variantId or phone" });
    }

    // Try Shopify twice in case of transient 429s/cold token
    let inventory_item_id = null;
    for (let i = 0; i < 2; i++) {
      try {
        inventory_item_id = await getVariantInventoryId(shop, variantId);
        if (inventory_item_id) break;
      } catch (e) {
        if (i === 1) throw e;
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    if (!inventory_item_id) {
      return res.status(404).json({ error: "No inventory_item_id for this variant" });
    }

    const doc = await Alert.findOneAndUpdate(
      { shop, inventory_item_id, phone },
      {
        $setOnInsert: {
          shop,
          inventory_item_id,
          phone,
          productId,
          variantId,
          sent: false,
          createdAt: new Date(),
        },
        $set: { updatedAt: new Date() },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    console.log("Alert saved", { shop, inventory_item_id, phone, id: doc?._id?.toString?.() });
    res.json({ success: true });
  } catch (err) {
    console.error("Error saving alert", err);
    const msg = err?.message || "Internal server error";
    res.status(500).json({ error: msg });
  }
});

module.exports = router;
