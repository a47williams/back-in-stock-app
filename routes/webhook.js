// routes/webhook.js
const express = require("express");
const crypto = require("crypto");
const Alert = require("../models/Alert");
const Shop = require("../models/Shop");
const { sendWhatsApp } = require("../utils/sendWhatsApp");

const router = express.Router();

/* ---------- HMAC helpers ---------- */
const {
  SHOPIFY_API_SECRET,
  HMAC_MODE = "lenient", // "strict" | "lenient"
  SKIP_HMAC = "false",   // "true" | "false"
} = process.env;

const isTrue = (v) => String(v).toLowerCase() === "true";

// Shopify sends HMAC over the raw body, so we capture it
const rawBodySaver = (req, res, buf) => {
  if (buf && buf.length) {
    req.rawBody = buf.toString("utf8");
  }
};
router.use(
  express.json({ verify: rawBodySaver, limit: "2mb" })
);

/* ---------- verify HMAC from header ---------- */
function verifyHmacFromHeader(req) {
  try {
    const shopifyHmac = req.get("x-shopify-hmac-sha256");
    if (!shopifyHmac || !req.rawBody) return false;
    const digest = crypto
      .createHmac("sha256", SHOPIFY_API_SECRET)
      .update(req.rawBody, "utf8")
      .digest("base64");
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(shopifyHmac));
  } catch {
    return false;
  }
}

/* ---------- Inventory + Products webhooks ---------- */
router.post("/inventory", async (req, res) => {
  const topic = req.get("x-shopify-topic") || "";
  const shop = req.get("x-shopify-shop-domain") || "";
  const hmacPresent = !!req.get("x-shopify-hmac-sha256");

  const strict = String(HMAC_MODE).toLowerCase() === "strict";
  const skip = isTrue(SKIP_HMAC);
  const hmacOk = verifyHmacFromHeader(req);

  if (!hmacOk) {
    if (skip) {
      console.warn("⚠️ HMAC invalid, SKIP_HMAC=true – continuing");
    } else if (strict) {
      console.error("❌ HMAC invalid (strict) – rejecting");
      return res.status(401).send("invalid hmac");
    } else {
      console.warn("⚠️ HMAC invalid (lenient) – continuing");
    }
  }

  res.status(200).send("ok"); // respond quickly so Shopify doesn’t retry

  try {
    const body = req.body || {};
    console.log("🪝 /webhook/inventory received", {
      topic,
      shop,
      len: req.rawBody ? String(req.rawBody.length) : "0",
    });

    let inventory_item_id = null;
    let available = null;

    if (topic === "inventory_levels/update") {
      inventory_item_id = String(body.inventory_item_id || "");
      available = typeof body.available === "number" ? body.available : null;
    } else if (topic === "products/update") {
      // leave inventory_item_id null, variants loop below
    }

    if (inventory_item_id) {
      if (!(available > 0)) {
        console.log("ℹ️ availability not positive/unknown; skip notifications.");
        return;
      }
      await notifyPendingForItem(shop, inventory_item_id, body);
      return;
    }

    if (topic === "products/update") {
      const variants = Array.isArray(body.variants) ? body.variants : [];
      const candidates = variants
        .filter(v => v && typeof v.inventory_item_id !== "undefined")
        .map(v => ({
          inventory_item_id: String(v.inventory_item_id),
          available: Number.isFinite(v.inventory_quantity) ? v.inventory_quantity : null
        }))
        .filter(v => v.available === null || v.available > 0);

      if (candidates.length === 0) {
        console.log("ℹ️ products/update: no variants with positive/unknown availability.");
        return;
      }
      for (const c of candidates) {
        await notifyPendingForItem(shop, c.inventory_item_id, body);
      }
      return;
    }

    console.log("ℹ️ Unhandled topic:", topic);
  } catch (err) {
    console.error("Webhook processing error:", err?.stack || err);
  }
});

/* ---------- helper: notify for an inventory_item_id ---------- */
async function notifyPendingForItem(shop, inventory_item_id, payload) {
  try {
    const pending = await Alert.find({
      shop,
      inventory_item_id,
      sent: { $ne: true }, // 🧠 only send once
    }).lean();

    console.log(`🔎 pending alerts for ${inventory_item_id}: ${pending.length}`);
    if (pending.length === 0) return;

    const productId =
      payload?.id ||
      payload?.product_id ||
      pending[0]?.productId ||
      null;

    const productUrl = productId
      ? `https://${shop}/products/${productId}`
      : `https://${shop}`;

    let sentCount = 0;

    for (const a of pending) {
      const to = a.phone.startsWith("whatsapp:") ? a.phone : `whatsapp:${a.phone}`;
      const msg = `Good news! An item you wanted is back in stock.\n\nView: ${productUrl}`;

      try {
        const resp = await sendWhatsApp(to, msg);
        console.log("📤 WhatsApp sent:", resp.sid);

        await Alert.updateOne(
          { _id: a._id },
          { $set: { sent: true, sentAt: new Date() } }
        );

        sentCount += 1;
      } catch (err) {
        console.error("sendWhatsApp error:", err?.code, err?.message || String(err));
      }
    }

    console.log(`✅ notified ${sentCount} / ${pending.length} for ${inventory_item_id}`);
  } catch (err) {
    console.error("notifyPendingForItem error:", err?.stack || err);
  }
}

module.exports = router;
