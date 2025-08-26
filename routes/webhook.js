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

// Capture raw body for HMAC verification
const rawBodySaver = (req, res, buf) => {
  if (buf && buf.length) {
    req.rawBody = buf.toString("utf8");
  }
};

router.use(express.json({ verify: rawBodySaver, limit: "2mb" }));

function verifyHmacFromHeader(req) {
  const shopifyHmac = req.get("x-shopify-hmac-sha256");
  if (!shopifyHmac || !req.rawBody) return false;

  const digest = crypto
    .createHmac("sha256", SHOPIFY_API_SECRET)
    .update(req.rawBody, "utf8")
    .digest("base64");

  return crypto.timingSafeEqual(
    Buffer.from(digest),
    Buffer.from(shopifyHmac)
  );
}

router.post("/inventory", async (req, res) => {
  const topic = req.get("x-shopify-topic") || "";
  const shop = req.get("x-shopify-shop-domain") || "";

  console.log("Webhook received:", { topic, shop });
  const strict = String(HMAC_MODE).toLowerCase() === "strict";
  const skip = isTrue(SKIP_HMAC);
  const hmacOk = verifyHmacFromHeader(req);

  console.log("HMAC valid:", hmacOk);

  if (!hmacOk) {
    if (skip) {
      console.warn("HMAC invalid, but SKIP_HMAC=true so continuing");
    } else if (strict) {
      console.error("HMAC invalid (strict mode) — rejecting request");
      return res.status(401).send("invalid hmac");
    } else {
      console.warn("HMAC invalid (lenient) — continuing");
    }
  }

  res.status(200).send("ok");

  try {
    const body = req.body || {};
    let inventory_item_id = null;
    let available = null;

    if (topic === "inventory_levels/update") {
      inventory_item_id = String(body.inventory_item_id || "");
      available = typeof body.available === "number" ? body.available : null;
    }

    console.log("Inventory update for:", inventory_item_id, "available:", available);

    if (!inventory_item_id || !(available > 0)) {
      console.log("Skipping: not a valid restock event or availability <= 0");
      return;
    }

    // Check pending alerts
    const pending = await Alert.find({
      shop,
      inventory_item_id,
      sent: { $ne: true },
    }).lean();

    console.log(`Pending alerts count: ${pending.length}`);
    if (pending.length === 0) return;

    const now = new Date();
    const sixtySecondsAgo = new Date(now.getTime() - 60 * 1000);

    const recent = await Alert.findOne({
      shop,
      inventory_item_id,
      sentAt: { $gte: sixtySecondsAgo },
    });

    if (recent) {
      console.log("Alert already sent recently — skipping");
      return;
    }

    const productId =
      body.product_id || body.id || pending[0]?.productId || null;

    const productUrl = productId
      ? `https://${shop}/products/${productId}`
      : `https://${shop}`;

    let sentCount = 0;

    for (const a of pending) {
      const to = a.phone.startsWith("whatsapp:") ? a.phone : `whatsapp:${a.phone}`;
      const msgUrl = productUrl;

      console.log("Sending WhatsApp to:", to, "for product:", productUrl);

      try {
        const resp = await sendWhatsApp(to, msgUrl);
        console.log("WhatsApp sent SID:", resp.sid);

        await Alert.updateOne(
          { _id: a._id },
          { $set: { sent: true, sentAt: now } }
        );

        sentCount++;
      } catch (err) {
        console.error("Twilio error code/message:", err.code, err.message || String(err));
      }
    }

    console.log(`Completed sending: ${sentCount}/${pending.length}`);
  } catch (err) {
    console.error("Error processing webhook:", err.stack || err);
  }
});

module.exports = router;
