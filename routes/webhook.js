// routes/webhook.js
const express = require("express");
const crypto = require("crypto");
const axios = require("axios");
const router = express.Router();

const Subscriber = require("../models/Subscriber");
const Shop = require("../models/Shop");
const { registerWebhooks } = require("../utils/registerWebhooks");
const { getAccessToken } = require("../utils/shopifyApi");

const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-04";
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN;
const WHATSAPP_SENDER    = process.env.WHATSAPP_SENDER;        // e.g. whatsapp:+16037165050
const WHATSAPP_TEMPLATE_SID = process.env.WHATSAPP_TEMPLATE_SID;

let twilioClient = null;
if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
  twilioClient = require("twilio")(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
}

function verifyShopifyWebhook(req) {
  try {
    const hmacHeader = req.get("X-Shopify-Hmac-Sha256") || "";
    const digest = crypto.createHmac("sha256", SHOPIFY_API_SECRET)
      .update(req.body) // Buffer (express.raw)
      .digest("base64");
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}

async function sendWhatsApp(to, variables = {}) {
  if (!twilioClient) throw new Error("Twilio client not configured");
  if (!WHATSAPP_SENDER) throw new Error("WHATSAPP_SENDER not set (e.g. whatsapp:+1...)");

  // Prefer Content API with approved template
  if (WHATSAPP_TEMPLATE_SID) {
    return twilioClient.messages.create({
      from: WHATSAPP_SENDER,
      to: `whatsapp:${String(to).replace(/^whatsapp:/, "")}`,
      contentSid: WHATSAPP_TEMPLATE_SID,
      contentVariables: JSON.stringify(variables || {}),
    });
  }

  // Fallback body (works only in 24h customer window)
  const body = variables?.["1"]
    ? `Good news! "${variables["1"]}" is back in stock.`
    : "Good news! Your item is back in stock.";
  return twilioClient.messages.create({
    from: WHATSAPP_SENDER,
    to: `whatsapp:${String(to).replace(/^whatsapp:/, "")}`,
    body,
  });
}

async function handleInventoryEvent(shop, inventoryItemId, available) {
  if (!shop || !inventoryItemId) return { notified: 0, reason: "missing_fields" };
  if (typeof available === "number" && available <= 0) return { notified: 0, reason: "not_available" };

  const subs = await Subscriber.find({ shop, inventoryItemId: String(inventoryItemId) }).lean();
  if (!subs.length) return { notified: 0, reason: "no_subscribers" };

  let ok = 0;
  for (const s of subs) {
    try {
      const vars = {
        1: s.productTitle || "Your item",
        2: s.productUrl || "",
      };
      await sendWhatsApp(s.phone, vars);
      await Subscriber.deleteOne({ _id: s._id }); // delete or mark sent
      ok++;
    } catch (e) {
      console.error("[WEBHOOK] Twilio send error:", e?.response?.data || e.message);
      // keep sub for later retry
    }
  }
  return { notified: ok, reason: "sent" };
}

/* ========= HMAC-verified Shopify webhook ========= */
router.post("/inventory", async (req, res) => {
  try {
    if (!verifyShopifyWebhook(req)) {
      console.warn("[WEBHOOK] inventory: HMAC failed");
      return res.sendStatus(401);
    }
    const shop = req.get("X-Shopify-Shop-Domain") || "";
    let payload = {};
    try { payload = JSON.parse(req.body.toString("utf8")); } catch (e) { /* ignore */ }

    const itemId = payload?.inventory_item_id;
    const available = payload?.available;

    const result = await handleInventoryEvent(shop, itemId, available);
    console.log(`[WEBHOOK] inventory: item ${itemId} ->`, result);
    return res.sendStatus(200);
  } catch (e) {
    console.error("[WEBHOOK] inventory error:", e.message);
    return res.sendStatus(200); // ack to stop retries
  }
});

/* ========= Utilities (no HMAC) ========= */

// Quick health
router.get("/status", (_req, res) => res.json({ ok: true, route: "webhooks", expectsRaw: true }));

// List webhooks for a shop
router.get("/list", async (req, res) => {
  try {
    const shop = (req.query.shop || "").trim();
    if (!shop) return res.status(400).json({ ok: false, error: "Missing shop" });
    const token = await getAccessToken(shop);
    const { data } = await axios.get(`https://${shop}/admin/api/${API_VERSION}/webhooks.json`, {
      headers: { "X-Shopify-Access-Token": token },
    });
    res.json({ ok: true, count: (data.webhooks || []).length, webhooks: data.webhooks || [] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Force (re)register webhooks now
router.post("/register", async (req, res) => {
  try {
    const shop = (req.query.shop || "").trim();
    if (!shop) return res.status(400).json({ ok: false, error: "Missing shop" });
    const token = await getAccessToken(shop);
    const regs = await registerWebhooks(shop, token, process.env.HOST);
    res.json({ ok: true, regs });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Dev trigger to simulate a restock (no HMAC) – great for testing end-to-end
router.post("/dev/trigger", async (req, res) => {
  try {
    const shop = (req.query.shop || "").trim();
    const itemId = req.query.inventory_item_id;
    const available = Number(req.query.available || "1");
    if (!shop || !itemId) return res.status(400).json({ ok: false, error: "Missing shop or inventory_item_id" });

    const result = await handleInventoryEvent(shop, itemId, available);
    res.json({ ok: true, result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
