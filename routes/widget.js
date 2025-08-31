// routes/widget.js
const express = require("express");
const router = express.Router();
const Subscriber = require("../models/Subscriber");
const { getVariantInventoryId } = require("../utils/shopifyApi");

/** Try to infer shop domain when 'shop' isn't provided */
function inferShopFromHeaders(req) {
  // Priority: explicit query ?shop=..., then Referer host if it's *.myshopify.com
  const q = (req.query.shop || "").trim().toLowerCase();
  if (q) return q;

  try {
    const ref = req.get("referer") || req.get("origin") || "";
    const h = new URL(ref).hostname.toLowerCase();
    if (h.endsWith(".myshopify.com")) return h; // use permanent domain
  } catch (_) {}
  return "";
}

router.post("/subscribe", async (req, res) => {
  try {
    let { shop, productId, variantId, phone, productTitle, productUrl } = req.body || {};

    // Normalize inputs
    shop = (shop || inferShopFromHeaders(req) || "").toLowerCase();
    productId = productId ? String(productId) : null;
    variantId = variantId ? String(variantId) : null;
    phone = phone ? String(phone).trim() : "";

    // New: accept productId OR variantId, but phone and shop are required
    if (!shop || !phone || (!productId && !variantId)) {
      return res.status(400).json({
        success: false,
        message: "Missing fields",
        need: { shop: !!shop, phone: !!phone, productId: !!productId, variantId: !!variantId }
      });
    }

    // Best-effort: resolve inventory_item_id when we have a variantId
    let inventoryItemId = null;
    try {
      if (variantId) {
        const invId = await getVariantInventoryId(shop, variantId);
        if (invId) inventoryItemId = String(invId);
      }
    } catch (e) {
      console.warn("[subscribe] inventory lookup failed:", e.message);
    }

    const upsertDoc = {
      shop,
      phone,
      productId,
      variantId,
      inventoryItemId,
      productTitle: productTitle || null,
      productUrl: productUrl || null,
      awaitingReply: false,
      templateSentAt: null,
    };

    // Upsert by (shop, phone, variantId?) so multiple products/variants per phone are allowed
    const query = variantId
      ? { shop, phone, variantId }
      : { shop, phone, productId };

    const saved = await Subscriber.findOneAndUpdate(
      query,
      { $set: upsertDoc },
      { upsert: true, new: true }
    );

    console.log("[BIS] subscribed:", {
      shop: saved.shop,
      id: String(saved._id),
      productId: saved.productId,
      variantId: saved.variantId,
      inventoryItemId: saved.inventoryItemId,
    });

    return res.status(200).json({ success: true, message: "You’re subscribed!" });
  } catch (err) {
    console.error("Subscription error:", err);
    return res.status(500).json({ success: false, message: "Server error subscribing" });
  }
});

module.exports = router;
