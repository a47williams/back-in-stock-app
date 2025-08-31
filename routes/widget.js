// routes/widget.js
const express = require("express");
const router = express.Router();
const Subscriber = require("../models/Subscriber");
const { getVariantInventoryId } = require("../utils/shopifyApi"); // must exist

router.post("/subscribe", async (req, res) => {
  try {
    const { shop, productId, variantId, phone, productTitle, productUrl } = req.body || {};

    if (!shop || !productId || !phone) {
      return res.status(400).json({ success: false, message: "Missing fields" });
    }

    // best-effort get inventory_item_id for webhook matching
    let inventoryItemId = null;
    try {
      if (variantId) {
        const invId = await getVariantInventoryId(shop, variantId);
        if (invId) inventoryItemId = String(invId);
      }
    } catch (e) {
      console.warn("[subscribe] inventory lookup failed:", e.message);
    }

    const normalized = {
      shop: String(shop).toLowerCase(),
      productId: String(productId),
      variantId: variantId ? String(variantId) : null,
      inventoryItemId: inventoryItemId ? String(inventoryItemId) : null,
      phone: String(phone),

      productTitle: productTitle || null,
      productUrl: productUrl || null,

      awaitingReply: false,
      templateSentAt: null,
    };

    // Upsert by (shop, phone, variantId or productId)
    const query = normalized.variantId
      ? { shop: normalized.shop, phone: normalized.phone, variantId: normalized.variantId }
      : { shop: normalized.shop, phone: normalized.phone, productId: normalized.productId };

    const doc = await Subscriber.findOneAndUpdate(
      query,
      { $set: normalized },
      { upsert: true, new: true }
    );

    console.log("[BIS] subscribed:", {
      shop: doc.shop,
      id: String(doc._id),
      productId: doc.productId,
      variantId: doc.variantId,
      inventoryItemId: doc.inventoryItemId,
    });

    return res.status(200).json({ success: true, message: "You’re subscribed!" });
  } catch (err) {
    console.error("Subscription error:", err);
    return res.status(500).json({ success: false, message: "Server error subscribing" });
  }
});

module.exports = router;
