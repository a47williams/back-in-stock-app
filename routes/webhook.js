// routes/webhook.js
const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const Alert = require("../models/Alert");
const { sendWhatsApp } = require("../utils/sendWhatsApp");

// Make raw body available for HMAC verification
router.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString("utf8");
    },
  })
);

function verifyHmac(req, secret) {
  const hmacHeader = req.get("X-Shopify-Hmac-Sha256") || "";
  const body = req.rawBody || JSON.stringify(req.body || {});
  const digest = crypto.createHmac("sha256", secret).update(body, "utf8").digest("base64");
  if (!hmacHeader) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}

// POST /webhook/inventory
router.post("/inventory", async (req, res) => {
  const skip = String(process.env.SKIP_HMAC || "").toLowerCase() === "true";
  if (!skip) {
    const ok = verifyHmac(req, process.env.SHOPIFY_API_SECRET || "");
    if (!ok) return res.status(401).send("HMAC invalid");
  } else {
    console.log("⚠️ HMAC invalid (lenient mode) — continuing", {
      topic: req.get("X-Shopify-Topic"),
      shop: req.get("X-Shopify-Shop-Domain"),
      len: (req.rawBody || "").length,
    });
  }

  try {
    const payload = req.body || {};
    const shop = req.get("X-Shopify-Shop-Domain") || "";
    const topic = req.get("X-Shopify-Topic") || "";

    let inventory_item_id = null;
    let available = null;

    if (topic === "inventory_levels/update") {
      inventory_item_id = String(payload?.inventory_item_id || "");
      available = Number(payload?.available ?? 0);
    } else if (topic === "products/update") {
      const variants = payload?.variants || [];
      if (variants.length > 0) {
        inventory_item_id = String(variants[0]?.inventory_item_id || "");
        available = Number(variants[0]?.inventory_quantity ?? 0);
      }
    }

    if (!inventory_item_id) {
      console.log("ℹ️ No inventory_item_id on payload — nothing to do.");
      return res.status(200).json({ ok: true, totalNotified: 0 });
    }

    const inStock = Number(available) > 0;

    const pending = await Alert.find({
      shop,
      inventory_item_id,
      sent: false,
    }).lean();

    console.log(
      `📦 products/update: inStock=${inStock} invItem=${inventory_item_id} | pending=${pending.length}`
    );

    let totalNotified = 0;
    if (inStock && pending.length) {
      for (const a of pending) {
        try {
          const link = `${process.env.SHOP_URL_PREFIX || ""}/products/${a.productId}?variant=${a.variantId}`;
          const msg = `Good news! Your item is back in stock. Tap to view: ${link}`;
          await sendWhatsApp(`whatsapp:${a.phone}`, msg);
          await Alert.updateOne({ _id: a._id }, { $set: { sent: true } });
          totalNotified++;
        } catch (err) {
          console.error("sendWhatsApp error:", err?.code || "", err?.message || err);
        }
      }
    }

    console.log("✅ Webhook processed — totalNotified:", totalNotified);
    res.json({ ok: true, totalNotified });
  } catch (e) {
    console.error("Webhook processing error:", e);
    res.status(500).send("Webhook error");
  }
});

module.exports = router;
