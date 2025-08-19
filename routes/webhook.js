const express = require("express");
const crypto = require("crypto");

const Alert = require("../models/Alert");
const sendWhatsApp = require("../utils/sendWhatsApp");

// ── HMAC helpers ──────────────────────────────────────────────────────────────
const WEBHOOK_SECRET =
  process.env.SHOPIFY_WEBHOOK_SECRET || process.env.SHOPIFY_API_SECRET || "";

function verifyShopifyHmac(req) {
  try {
    const hmacHeader = req.get("X-Shopify-Hmac-Sha256") || "";
    if (!WEBHOOK_SECRET || !hmacHeader) return false;

    // req.rawBody must be the unparsed bytes of the request
    const digest = crypto
      .createHmac("sha256", WEBHOOK_SECRET)
      .update(req.rawBody || "")
      .digest("base64");

    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}

// ── Router (use raw body *only* for this route) ───────────────────────────────
const router = express.Router();

// IMPORTANT: raw() first, then JSON parse manually after verifying
router.post(
  "/inventory",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const ok = verifyShopifyHmac(req);

    if (!ok) {
      console.warn("HMAC invalid");
      return res.status(401).send("HMAC invalid");
    }

    let body;
    try {
      body = JSON.parse(req.rawBody.toString("utf8"));
    } catch (e) {
      console.error("webhook: bad JSON", e);
      return res.status(400).send("bad json");
    }

    const topic = req.get("X-Shopify-Topic") || "";
    const shop = req.get("X-Shopify-Shop-Domain") || "";

    // We handle both topics the same way: find alerts by inventory_item_id
    let inventory_item_id = null;
    if (topic === "inventory_levels/update") {
      inventory_item_id = String(body.inventory_item_id || "");
    } else if (topic === "products/update") {
      // Check variants to see which ones are now available
      // (Your existing parse logic can stay; keeping it compact here)
      // If you already wrote a helper that extracts available variant->inventory_item_id, call it.
    }

    // If you store pending alerts by inventory_item_id, look them up:
    if (!inventory_item_id) {
      console.log("No inventory_item_id on payload — nothing to do.");
      return res.status(200).send("ok");
    }

    // Example: find one pending alert and send (or your batch logic)
    const pending = await Alert.find({ shop, inventory_item_id, sent: { $ne: true } })
      .sort({ createdAt: 1 })
      .limit(1);

    if (!pending.length) {
      console.log(`No pending alerts for ${inventory_item_id}`);
      return res.status(200).send("ok");
    }

    const a = pending[0];
    try {
      const msg = await sendWhatsApp(
        `whatsapp:${a.phone}`,
        `Good news! This item is back in stock: ${process.env.HOST}/products/${a.productId}?variant=${a.variantId}`
      );
      await Alert.updateOne({ _id: a._id }, { $set: { sent: true, sid: msg.sid } });
      console.log(`Notified ${a.phone} sid ${msg.sid}`);
    } catch (err) {
      console.error("sendWhatsApp failed", err && err.code, err && err.message);
    }

    return res.status(200).send("ok");
  }
);

module.exports = router;
