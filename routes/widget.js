// routes/widget.js
const express = require("express");
const router = express.Router();
const Subscriber = require("../models/Subscriber");
const { getVariantProductId, getVariantInventoryId } = require("../utils/shopifyApi");

/**
 * POST /widget/subscribe
 * Body: { shop, phone, productId?, variantId? }
 * Requires: shop + phone + (productId OR variantId)
 * Stores: shop, phone, productId (derived if missing), variantId, inventoryItemId (if variantId provided)
 */
router.post("/subscribe", async (req, res) => {
  try {
    const { shop, phone, productId, variantId } = req.body || {};

    if (!shop || !phone || (!productId && !variantId)) {
      return res.status(400).json({ success: false, message: "Missing fields" });
    }

    // Derive productId if only variantId provided
    let finalProductId = productId || null;
    if (!finalProductId && variantId) {
      try {
        finalProductId = await getVariantProductId(shop, variantId);
      } catch (e) {
        console.warn("[BIS] derive productId failed:", e.message);
      }
    }

    // Derive inventory_item_id for fast webhook matching later
    let inventoryItemId = null;
    if (variantId) {
      try {
        inventoryItemId = await getVariantInventoryId(shop, variantId);
      } catch (e) {
        console.warn("[BIS] derive inventoryItemId failed:", e.message);
      }
    }

    // Upsert to avoid duplicates (shop + phone + productId/variantId)
    // Adjust to your schema/index if needed.
    const filter = {
      shop,
      phone,
      ...(variantId ? { variantId } : { productId: finalProductId || null }),
    };
    const update = {
      shop,
      phone,
      productId: finalProductId || null,
      variantId: variantId || null,
      inventoryItemId: inventoryItemId || null,
      updatedAt: new Date(),
    };

    const doc = await Subscriber.findOneAndUpdate(filter, update, {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
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
    return res
      .status(500)
      .json({ success: false, message: "Server error subscribing" });
  }
});

/**
 * GET /widget/debug?shop=xxx&limit=10
 * Quick debug endpoint: list recent subs for a shop
 */
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
