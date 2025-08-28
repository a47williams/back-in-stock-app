// routes/widget.js
const express = require("express");
const router = express.Router();
const Subscriber = require("../models/Subscriber");
const { getVariantProductId } = require("../utils/shopifyApi");

// POST /widget/subscribe
// Accepts: { shop, phone, productId? , variantId? }
// Requires: shop + phone + (productId OR variantId)
router.post("/subscribe", async (req, res) => {
  try {
    const { shop, phone, productId, variantId } = req.body || {};

    if (!shop || !phone || (!productId && !variantId)) {
      return res
        .status(400)
        .json({ success: false, message: "Missing fields" });
    }

    // Derive productId from variantId if needed
    let finalProductId = productId || null;
    if (!finalProductId && variantId) {
      try {
        finalProductId = await getVariantProductId(shop, variantId);
      } catch (e) {
        // If we can’t resolve it, continue; you can still store the sub
        console.warn("Could not resolve productId from variantId:", e.message);
      }
    }

    await Subscriber.create({
      shop,
      productId: finalProductId || null,
      // variantId is optional; safe to store if your schema allows, ignored otherwise
      variantId: variantId || null,
      phone,
    });

    return res
      .status(200)
      .json({ success: true, message: "You’re subscribed!" });
  } catch (err) {
    console.error("Subscription error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Server error subscribing" });
  }
});

module.exports = router;
