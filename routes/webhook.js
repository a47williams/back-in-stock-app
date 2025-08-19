// routes/webhook.js
const express = require("express");
const crypto = require("crypto");
const router = express.Router();

const Alert = require("../models/Alert");
let sendWhatsApp = require("../utils/sendWhatsApp");
// tolerate either default or named export
if (sendWhatsApp && typeof sendWhatsApp !== "function" && typeof sendWhatsApp.sendWhatsApp === "function") {
  sendWhatsApp = sendWhatsApp.sendWhatsApp;
}

/** Verify Shopify HMAC (skip with SKIP_HMAC=true for local testing) */
function verifyHmac(req, rawBody) {
  if (process.env.SKIP_HMAC === "true") return true;
  const secret = process.env.SHOPIFY_API_SECRET || process.env.SHOPIFY_SHARED_SECRET || "";
  const header = req.get("X-Shopify-Hmac-Sha256") || "";
  if (!secret || !header || !rawBody) return false;
  const digest = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  try { return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(digest)); }
  catch { return false; }
}

/** Normalize numeric id from gid://shopify/.../123 or number */
function normId(id) {
  if (id == null) return null;
  const s = String(id);
  const m = s.match(/(\d+)$/);
  return m ? m[1] : s;
}

// Capture raw body for HMAC + JSON parse ourselves
router.post("/inventory", express.raw({ type: "*/*" }), async (req, res) => {
  const raw = req.body?.toString?.("utf8") || "";
  const topic = req.get("X-Shopify-Topic") || "";
  const shop  = (req.get("X-Shopify-Shop-Domain") || "").toLowerCase();

  if (!verifyHmac(req, raw)) {
    console.warn("⛔️ HMAC invalid");
    return res.status(401).end();
  }

  let payload = {};
  try { payload = JSON.parse(raw || "{}"); }
  catch (e) { console.error("❌ webhook JSON parse error:", e.message); return res.status(400).end(); }

  console.log("🪝 /webhook/inventory", { topic, shop });

  let totalNotified = 0;

  try {
    // --- PRIMARY: products/update (includes variants + handle + title) ---
    if (topic === "products/update") {
      const title   = payload?.title || "your item";
      const handle  = payload?.handle || ""; // may be empty on some drafts
      const variants = Array.isArray(payload?.variants) ? payload.variants : [];

      // Find variants now in stock
      const hot = variants
        .filter(v => (typeof v.inventory_quantity === "number" ? v.inventory_quantity > 0 : false))
        .map(v => ({ variantId: normId(v.id), qty: Number(v.inventory_quantity || 0) }))
        .filter(v => v.variantId);

      if (hot.length === 0) {
        console.log("ℹ️ products/update: no variants with inventory_quantity > 0");
        return res.status(200).end();
      }

      for (const h of hot) {
        const pending = await Alert.find({
          shop,
          variantId: String(h.variantId),
          sent: { $ne: true },
        }).lean();

        console.log(`🔎 variant ${h.variantId} now in stock (qty=${h.qty}) | pending=${pending.length}`);

        // Build links
        const productUrl = handle
          ? `https://${shop}/products/${handle}?variant=${h.variantId}`
          : ""; // handle may be absent on some payloads
        const cartUrl = `https://${shop}/cart/${encodeURIComponent(h.variantId)}:1`;

        // Compose message
        const body = productUrl
          ? `✅ Back in stock: ${title}\n${productUrl}`
          : `✅ Back in stock: ${title}\n${cartUrl}`;

        for (const a of pending) {
          try {
            const resp = await sendWhatsApp(a.phone, body);
            if (resp && resp.sid) {
              await Alert.updateOne({ _id: a._id }, { $set: { sent: true, sentAt: new Date() } });
              totalNotified++;
              console.log("📲 Notified", a.phone, "sid", resp.sid);
            } else {
              console.warn("⚠️ WhatsApp send returned no SID for", a.phone);
            }
          } catch (err) {
            console.error("❌ send error", a.phone, err.message || err);
          }
        }
      }

      console.log("✅ products/update done — totalNotified=", totalNotified);
      return res.status(200).end();
    }

    // --- Secondary: inventory_levels/update (no handle/title) ---
    if (topic === "inventory_levels/update") {
      const invItemId = normId(payload?.inventory_item_id);
      const available = Number(payload?.available ?? 0);
      console.log("📦 inventory_levels/update", { invItemId, available });
      // We’re matching by variantId in MVP; inventory_levels only gives inventory_item_id.
      // If you want to support this path, map inv_item_id -> variantId via Admin API before notifying.
      return res.status(200).end();
    }

    console.log("ℹ️ Unhandled topic", topic);
    return res.status(200).end();
  } catch (e) {
    console.error("💥 webhook processing error:", e);
    return res.status(200).end(); // 200 to prevent retry storm while debugging
  }
});

module.exports = router;
