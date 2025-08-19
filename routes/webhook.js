// routes/webhook.js
const express = require("express");
const crypto = require("crypto");
const Alert = require("../models/Alert");
const Shop = require("../models/Shop");
const { sendWhatsApp } = require("../utils/sendWhatsApp");

const router = express.Router();

const {
  SHOPIFY_API_SECRET,
  HMAC_MODE = "lenient",
  SKIP_HMAC = "false",
} = process.env;

const isTrue = (v) => String(v).toLowerCase() === "true";

// Capture raw body for HMAC validation
const rawBodySaver = (req, res, buf) => {
  if (buf && buf.length) {
    req.rawBody = buf.toString("utf8");
  }
};
router.use(express.json({ verify: rawBodySaver, limit: "2mb" }));

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

router.post("/inventory", async (req, res) => {
  const topic = req.get("x-shopify-topic") || "";
  const shop = req.get("x-shopify-shop-domain") || "";

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

  res.status(200).send("ok");

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
    }

    if (inventory_item_id) {
      if (!(available > 0)) {
        console.log("ℹ️ availability not positive/unknown; skip notifications.");
        return;
      }
      await notifyPendingForItem(shop, inventory_item_id, body);
      return;
    }

    console.log("ℹ️ Unhandled topic:", topic);
  } catch (err) {
    console.error("Webhook processing error:", err?.stack || err);
  }
});

async function notifyPendingForItem(shop, inventory_item_id, payload) {
  try {
    const now = new Date();
    const sixtySecondsAgo = new Date(now.getTime() - 60 * 1000);

    const pending = await Alert.find({
      shop,
      inventory_item_id,
      sent: { $ne: true },
    }).lean();

    console.log(`🔎 pending alerts for ${inventory_item_id}: ${pending.length}`);
    if (pending.length === 0) return;

    // Check if already notified recently
    const recent = await Alert.findOne({
      shop,
      inventory_item_id,
      sentAt: { $gte: sixtySecondsAgo },
    });

    if (recent) {
      console.log(`⏱ Skipping alert for ${inventory_item_id} — recently sent`);
      return;
    }

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
          { $set: { sent: true, sentAt: now } }
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
