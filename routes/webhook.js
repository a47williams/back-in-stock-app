// routes/webhook.js
const express = require("express");
const crypto = require("crypto");
const router = express.Router();

const Alert = require("../models/Alert");
const WebhookReceipt = require("../models/WebhookReceipt");

let sendWhatsApp = require("../utils/sendWhatsApp");
if (sendWhatsApp && typeof sendWhatsApp !== "function" && typeof sendWhatsApp.sendWhatsApp === "function") {
  sendWhatsApp = sendWhatsApp.sendWhatsApp;
}

/** HMAC verify (skip with SKIP_HMAC=true during local testing) */
function verifyHmac(req, raw) {
  if (process.env.SKIP_HMAC === "true") return true;
  const secret = process.env.SHOPIFY_API_SECRET || process.env.SHOPIFY_SHARED_SECRET || "";
  const hdr = req.get("X-Shopify-Hmac-Sha256") || "";
  if (!secret || !hdr || !raw) return false;
  const digest = crypto.createHmac("sha256", secret).update(raw, "utf8").digest("base64");
  try { return crypto.timingSafeEqual(Buffer.from(hdr), Buffer.from(digest)); } catch { return false; }
}

/** Normalize numeric id */
function normId(id) { const s = String(id ?? ""); const m = s.match(/(\d+)$/); return m ? m[1] : s; }

/** Claim an alert atomically so only one request sends it */
async function claimAlert(alertId) {
  const pre = await Alert.findOneAndUpdate(
    { _id: alertId, sent: { $ne: true } },
    { $set: { sent: true, sentAt: new Date() } },
    { new: false } // return the document BEFORE update; if null, someone else claimed
  );
  return !!pre;
}

router.post("/inventory", express.raw({ type: "*/*" }), async (req, res) => {
  const raw = req.body?.toString?.("utf8") || "";
  const topic = req.get("X-Shopify-Topic") || "";
  const shop  = (req.get("X-Shopify-Shop-Domain") || "").toLowerCase();
  const webhookId = req.get("X-Shopify-Webhook-Id") || ""; // unique per delivery

  if (!verifyHmac(req, raw)) { console.warn("⛔️ HMAC invalid"); return res.status(401).end(); }

  // Idempotency: if we've processed this webhookId, exit fast
  if (webhookId) {
    try {
      await WebhookReceipt.create({ webhookId, topic, shop });
    } catch (e) {
      if (e?.code === 11000) {
        console.log("♻️ Duplicate webhook delivery ignored:", webhookId);
        return res.status(200).end();
      }
    }
  }

  let payload = {};
  try { payload = JSON.parse(raw || "{}"); }
  catch { return res.status(400).end(); }

  try {
    if (topic === "products/update") {
      const title = payload?.title || "your item";
      const handle = payload?.handle || "";
      const variants = Array.isArray(payload?.variants) ? payload.variants : [];

      // variants now in stock (qty > 0)
      const hot = variants
        .filter(v => typeof v.inventory_quantity === "number" && v.inventory_quantity > 0)
        .map(v => ({ variantId: normId(v.id), qty: Number(v.inventory_quantity || 0) }))
        .filter(v => v.variantId);

      if (!hot.length) return res.status(200).end();

      let total = 0;

      for (const h of hot) {
        const pending = await Alert.find({
          shop,
          variantId: String(h.variantId),
          sent: { $ne: true },
        }).lean();

        if (!pending.length) continue;

        // Build links
        const productUrl = handle
          ? `https://${shop}/products/${handle}?variant=${h.variantId}`
          : "";
        const cartUrl = `https://${shop}/cart/${encodeURIComponent(h.variantId)}:1`;
        const body = productUrl
          ? `✅ Back in stock: ${title}\n${productUrl}`
          : `✅ Back in stock: ${title}\n${cartUrl}`;

        for (const a of pending) {
          try {
            // Atomically claim this alert so only one sender sends it
            const claimed = await claimAlert(a._id);
            if (!claimed) {
              // someone else (or another webhook delivery) already took it
              continue;
            }

            const resp = await sendWhatsApp(
              a.phone?.startsWith("whatsapp:") ? a.phone : `whatsapp:${a.phone}`,
              body
            );

            if (resp && resp.sid) {
              total++;
              await Alert.updateOne({ _id: a._id }, { $set: { lastSid: resp.sid } });
              console.log("📲 Notified", a.phone, "sid", resp.sid);
            } else {
              // rollback claim if send failed
              await Alert.updateOne({ _id: a._id }, { $set: { sent: false }, $unset: { sentAt: 1 } });
              console.warn("⚠️ send returned no SID; rolled back sent flag for", a._id.toString());
            }
          } catch (err) {
            // rollback on error
            await Alert.updateOne({ _id: a._id }, { $set: { sent: false }, $unset: { sentAt: 1 } });
            console.error("❌ send error; rolled back", a._id.toString(), err.message || err);
          }
        }
      }

      console.log("✅ webhook processed — notified:", total);
      return res.status(200).end();
    }

    // For inventory_levels/update we currently rely on products/update to include variant ids
    return res.status(200).end();
  } catch (e) {
    console.error("💥 webhook processing error:", e);
    return res.status(200).end(); // still 200 to avoid retry storms
  }
});

module.exports = router;
