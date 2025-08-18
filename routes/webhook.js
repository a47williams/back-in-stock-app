// routes/webhook.js
const express = require("express");
const crypto = require("crypto");
const router = express.Router();

const Alert = require("../models/Alert");
const sendWhatsApp = require("../utils/sendWhatsApp");

// HMAC verification helper
function verifyHmac(req, rawBody) {
  if (process.env.SKIP_HMAC === "true") return true;
  const hmacHeader = req.get("X-Shopify-Hmac-Sha256") || "";
  const digest = crypto
    .createHmac("sha256", process.env.SHOPIFY_API_SECRET)
    .update(rawBody, "utf8")
    .digest("base64");
  return crypto.timingSafeEqual(Buffer.from(hmacHeader), Buffer.from(digest));
}

router.post("/inventory", express.raw({ type: "*/*" }), async (req, res) => {
  const raw = req.body?.toString?.("utf8") || "";
  const topic = req.get("X-Shopify-Topic") || "";
  const shop = (req.get("X-Shopify-Shop-Domain") || "").toLowerCase();

  // Verify webhook
  if (!verifyHmac(req, raw)) {
    console.warn("⛔️ HMAC invalid or missing");
    return res.status(401).end();
  }

  let payload = {};
  try {
    payload = JSON.parse(raw);
  } catch (e) {
    console.error("❌ Invalid JSON webhook payload");
    return res.status(400).end();
  }

  console.log("📬 /webhook/inventory received {");
  console.log("  topic:", `'${topic}' ,`);
  console.log("  shop: ", `'${shop}' ,`);
  console.log("}");

  let totalNotified = 0;

  try {
    if (topic === "products/update") {
      // Products update contains variants with id + inventory_quantity
      const variants = Array.isArray(payload.variants) ? payload.variants : [];
      for (const v of variants) {
        const variantId = String(v.id);
        // inventory_quantity may be number; treat >0 as in stock
        const qty = typeof v.inventory_quantity === "number" ? v.inventory_quantity : 0;

        if (qty > 0) {
          // Find pending alerts by variantId + shop
          const pending = await Alert.find({
            shop,
            variantId,
            sent: { $ne: true },
          }).lean();

          console.log(
            `🔍 products/update: inStock variantId=${variantId} | pending=${pending.length}`
          );

          for (const a of pending) {
            const ok = await sendWhatsApp(a.phone, {
              productId: a.productId,
              variantId: a.variantId,
              shop,
            });

            if (ok) {
              await Alert.updateOne({ _id: a._id }, { $set: { sent: true, sentAt: new Date() } });
              totalNotified++;
            }
          }
        }
      }
    } else if (topic === "inventory_levels/update") {
      // We only get inventory_item_id here; if you want variantId matching on this topic too,
      // you can map inventory_item_id -> variantId using Admin API, then notify by variantId.
      // For now we log and rely on products/update which Shopify also sends on stock changes.
      const invId = payload?.inventory_item_id ? String(payload.inventory_item_id) : null;
      console.log(
        "ℹ️ inventory_levels/update received. inventory_item_id=",
        invId,
        " (relying on products/update for variantId matching)"
      );
    } else {
      console.log("ℹ️ Unhandled topic:", topic);
    }
  } catch (err) {
    console.error("❌ Webhook processing error:", err);
  }

  console.log("✅ Webhook processed – totalNotified=", totalNotified);
  res.status(200).end();
});

module.exports = router;
