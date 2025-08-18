// routes/webhook.js
const express = require("express");
const crypto = require("crypto");
const router = express.Router();

const Alert = require("../models/Alert");
const { sendWhatsApp } = require("../utils/sendWhatsApp");

const SHOPIFY_WEBHOOK_SECRET =
  process.env.SHOPIFY_API_SECRET || process.env.SHOPIFY_SHARED_SECRET;

/** Verify Shopify HMAC (unless SKIP_HMAC=true for testing) */
function verifyShopifyWebhook(req) {
  if (process.env.SKIP_HMAC === "true") return true;

  const hmacHeader = req.get("X-Shopify-Hmac-Sha256") || "";
  const rawBody = req.rawBody || "";
  const digest = crypto
    .createHmac("sha256", SHOPIFY_WEBHOOK_SECRET)
    .update(rawBody, "utf8")
    .digest("base64");
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
}

/** Needed so we can verify HMAC against the raw body */
router.use(
  "/inventory",
  express.raw({ type: "*/*" }) // capture raw payload
);

/**
 * POST /webhook/inventory
 * Handles both products/update and inventory_levels/update.
 */
router.post("/inventory", async (req, res) => {
  try {
    const topic = req.get("X-Shopify-Topic") || "";
    const shopHeader = (req.get("X-Shopify-Shop-Domain") || "").toLowerCase();
    const shop = shopHeader || null;

    if (!verifyShopifyWebhook(req)) {
      console.warn("⚠️ HMAC invalid or missing");
      return res.status(401).send("unauthorized");
    }

    // Parse JSON after HMAC check
    let payload;
    try {
      payload = JSON.parse(req.body.toString("utf8"));
    } catch (e) {
      console.error("JSON parse error:", e);
      return res.status(400).send("bad json");
    }

    const bodyLen = req.body.length || JSON.stringify(payload).length;
    console.log("📦 /webhook/inventory received {");
    console.log(`  topic: '${topic}',`);
    console.log(`  shop: '${shop}',`);
    console.log(`  hmacPresent: true,`);
    console.log(`  length: '${bodyLen}'`);
    console.log("}");

    // Extract inventory_item_id and availability flag
    let inventory_item_id = null;
    let available = null;

    if (topic.includes("inventory_levels")) {
      inventory_item_id = String(payload.inventory_item_id || "");
      available = Number(payload.available ?? 0);
    } else if (topic.includes("products")) {
      // products/update — scan variants to find any with > 0 and emit their inventory_item_id
      // (best effort; your store may also send inventory_levels/update which is more precise)
      if (payload && Array.isArray(payload.variants)) {
        const hot = payload.variants.find(
          (v) => Number(v.inventory_quantity ?? 0) > 0
        );
        if (hot) {
          inventory_item_id = String(hot.inventory_item_id || "");
          available = Number(hot.inventory_quantity ?? 0);
        }
      }
    }

    console.log(
      `🔎 Parsed: inventory_item_id='${inventory_item_id}', available=${available}`
    );

    if (!inventory_item_id) {
      console.log("ℹ️ No inventory_item_id on payload — nothing to do.");
      return res.status(200).send("ok");
    }
    if (!(available > 0)) {
      console.log(
        "ℹ️ Availability not positive/unknown; skip notifications."
      );
      return res.status(200).send("ok");
    }

    // Find pending alerts keyed by (shop + inventory_item_id)
    const query = {
      shop: shop,
      inventory_item_id: String(inventory_item_id),
      sent: false,
    };

    const pending = await Alert.find(query).lean();
    console.log(
      `📊 products/update: inStock=${inventory_item_id} | pending=${pending.length}`
    );

    if (pending.length === 0) {
      console.log("✅ Webhook processed — totalNotified=0");
      return res.status(200).send("ok");
    }

    // Send each WhatsApp and mark sent
    let sentCount = 0;
    for (const a of pending) {
      try {
        const ok = await sendWhatsApp(a.phone, `Good news! Your item is back in stock.`);
        if (ok) {
          await Alert.updateOne(
            { _id: a._id },
            { $set: { sent: true, updatedAt: new Date() } }
          );
          sentCount += 1;
        }
      } catch (err) {
        console.error("sendWhatsApp failed:", { phone: a.phone }, err);
      }
    }

    console.log(`✅ Webhook processed — totalNotified=${sentCount}`);
    return res.status(200).send("ok");
  } catch (err) {
    console.error("❌ webhook error:", err);
    return res.status(500).send("error");
  }
});

module.exports = router;
