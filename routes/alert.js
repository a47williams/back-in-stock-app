// routes/alert.js
const express = require("express");
const router = express.Router();
const Alert = require("../models/Alert");

/**
 * Register a back-in-stock alert.
 * We now save by (shop, productId, variantId, phone) with no inventory lookup.
 * The webhook will match by variantId when the product is updated/restocked.
 */
router.post("/register", express.json(), async (req, res) => {
  try {
    const { shop, productId, variantId, phone } = req.body || {};

    // Minimal validation
    const missing = [];
    if (!shop) missing.push("shop");
    if (!productId) missing.push("productId");
    if (!variantId) missing.push("variantId");
    if (!phone) missing.push("phone");
    if (missing.length) {
      return res.status(400).json({ error: `Missing: ${missing.join(", ")}` });
    }

    const doc = await Alert.findOneAndUpdate(
      { shop, productId, variantId, phone },
      { shop, productId, variantId, phone, sent: false },
      { upsert: true, new: true }
    );

    console.log("✅ Alert saved", {
      shop,
      productId,
      variantId,
      phone,
      id: doc?._id?.toString?.(),
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("❌ Error saving alert", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
