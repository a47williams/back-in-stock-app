// routes/widget.js
const express = require("express");
const router = express.Router();
const Subscriber = require("../models/Subscriber");
const { getVariantProductId, getVariantInventoryId } = require("../utils/shopifyApi");

// POST /widget/subscribe
router.post("/subscribe", async (req, res) => {
  try {
    const { shop, phone, productId, variantId } = req.body || {};

    if (!shop || !phone || (!productId && !variantId)) {
      return res.status(400).json({ success: false, message: "Missing fields" });
    }

    // derive fields when possible
    let finalProductId = productId || null;
    let inventoryItemId = null;

    if (variantId) {
      try { finalProductId = finalProductId || await getVariantProductId(shop, variantId); } catch (e) {
        console.warn("[BIS] productId derive fail:", e.message);
      }
      try { inventoryItemId = await getVariantInventoryId(shop, variantId); } catch (e) {
        console.warn("[BIS] inventoryItemId derive fail:", e.message);
      }
    }

    const filter = {
      shop,
      phone,
      ...(variantId ? { variantId: String(variantId) } : { productId: String(finalProductId || "") }),
    };

    const update = {
      shop,
      phone,
      productId: finalProductId ? String(finalProductId) : null,
      variantId: variantId ? String(variantId) : null,
      inventoryItemId: inventoryItemId ? String(inventoryItemId) : null,
      updatedAt: new Date(),
    };

    const doc = await Subscriber.findOneAndUpdate(filter, update, {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    });

    console.log("[BIS] subscribed:", {
      shop,
      id: String(doc._id),
      productId: doc.productId,
      variantId: doc.variantId,
      inventoryItemId: doc.inventoryItemId,
    });

    return res.status(200).json({
      success: true,
      message: "You’re subscribed!",
      id: String(doc._id),
      productId: doc.productId,
      variantId: doc.variantId,
      inventoryItemId: doc.inventoryItemId || null,
    });
  } catch (err) {
    console.error("Subscription error:", err);
    return res.status(500).json({ success: false, message: "Server error subscribing" });
  }
});

// GET /widget/debug?shop=...&limit=10
router.get("/debug", async (req, res) => {
  try {
    const shop = (req.query.shop || "").trim();
    const limit = Math.min(parseInt(req.query.limit || "10", 10), 50);
    if (!shop) return res.status(400).json({ ok: false, error: "Missing shop" });

    const rows = await Subscriber.find({ shop })
      .sort({ updatedAt: -1, _id: -1 })
      .limit(limit)
      .lean();

    res.json({ ok: true, count: rows.length, rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
