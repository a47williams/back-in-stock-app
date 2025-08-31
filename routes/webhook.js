// routes/webhook.js
const express = require("express");
const crypto = require("crypto");
const axios = require("axios");
const router = express.Router();

const Subscriber = require("../models/Subscriber");
const { registerWebhooks } = require("../utils/registerWebhooks");
const { getAccessToken } = require("../utils/shopifyApi");

const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-04";

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN;
const WHATSAPP_SENDER    = process.env.WHATSAPP_SENDER;           // "whatsapp:+16037165050"
const TEMPLATE_NAME      = process.env.WHATSAPP_TEMPLATE_NAME;    // e.g., "restock_ping_en"
const TEMPLATE_LANG      = process.env.WHATSAPP_TEMPLATE_LANG || "en";

let twilioClient = null;
if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
  twilioClient = require("twilio")(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
}

/* ---------- Helpers ---------- */
function verifyShopifyWebhook(req) {
  try {
    const hmacHeader = req.get("X-Shopify-Hmac-Sha256") || "";
    // accept Buffer OR object body
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}), "utf8");
    const digest = crypto.createHmac("sha256", SHOPIFY_API_SECRET).update(raw).digest("base64");
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}

function normalizeWpAddr(val) {
  const s = String(val || "").trim();
  return s.startsWith("whatsapp:") ? s : `whatsapp:${s}`;
}

/** Send an approved WhatsApp template (no variables) by name */
async function sendTemplatePing(to) {
  if (!twilioClient) throw new Error("Twilio client not configured");
  if (!WHATSAPP_SENDER) throw new Error("WHATSAPP_SENDER missing");
  if (!TEMPLATE_NAME) throw new Error("WHATSAPP_TEMPLATE_NAME missing");

  const payload = {
    from: normalizeWpAddr(WHATSAPP_SENDER),
    to: normalizeWpAddr(to),
    template: {
      name: TEMPLATE_NAME,
      language: { code: TEMPLATE_LANG },
      // No components because this template has NO variables
    },
  };
  if (process.env.WHATSAPP_MESSAGING_SERVICE_SID) {
    payload.messagingServiceSid = process.env.WHATSAPP_MESSAGING_SERVICE_SID;
  }
  const resp = await twilioClient.messages.create(payload);
  return { sid: resp.sid, status: resp.status };
}

/** Find subs for a given inventory item id (string/number tolerant) */
async function findSubsByInventoryItem(shop, inventoryItemId) {
  const s = String(shop || "").toLowerCase();
  const idRaw = String(inventoryItemId || "").trim();
  const numeric = /^\d+$/.test(idRaw) ? String(Number(idRaw)) : null;
  const inSet = numeric && numeric !== idRaw ? [idRaw, numeric] : [idRaw];
  return Subscriber.find({
    shop: { $in: [s, shop] },
    inventoryItemId: { $in: inSet },
  }).lean();
}

/** Main notifier: send ping template; wait for user reply to send URL link */
async function handleInventoryEvent(shop, inventoryItemId, available, { debug = false } = {}) {
  if (!shop || !inventoryItemId) return { notified: 0, attempted: 0, failures: [], reason: "missing_fields" };
  if (typeof available === "number" && available <= 0) return { notified: 0, attempted: 0, failures: [], reason: "not_available" };

  const subs = await findSubsByInventoryItem(shop, inventoryItemId);
  if (!subs.length) return { notified: 0, attempted: 0, failures: [], reason: "no_subscribers" };

  let ok = 0;
  const failures = [];

  for (const s of subs) {
    try {
      const resp = await sendTemplatePing(s.phone);
      console.log("[WEBHOOK] ping template SID:", resp.sid, "to:", s.phone);

      // Keep row for follow-up; mark awaiting reply
      await Subscriber.updateOne(
        { _id: s._id },
        { $set: { awaitingReply: true, templateSentAt: new Date() } }
      );

      ok++;
    } catch (e) {
      const errMsg = e?.response?.data ? JSON.stringify(e.response.data) : e.message;
      console.error("[WEBHOOK] ping send error:", errMsg, "to:", s.phone);
      failures.push({ _id: String(s._id), phone: s.phone, error: errMsg });
      // keep the row for retry later
    }
  }

  const result = {
    notified: ok,              // number of pings sent
    attempted: subs.length,
    failures,
    reason: ok > 0 ? "ping_sent" : (failures.length ? "twilio_failed" : "unknown"),
  };
  return debug ? result : { notified: result.notified, reason: result.reason };
}

/* ---------- Webhook routes ---------- */

// Shopify: inventory_levels/update (HMAC verified)
// NOTE: Ideally mount with express.raw({ type: 'application/json' }) for perfect HMAC;
// our verify tolerates parsed JSON as well.
router.post("/inventory", async (req, res) => {
  try {
    if (!verifyShopifyWebhook(req)) {
      console.warn("[WEBHOOK] inventory: HMAC failed");
      return res.sendStatus(401);
    }
    const shop = req.get("X-Shopify-Shop-Domain") || "";
    let payload = {};
    try { payload = typeof req.body === "object" ? req.body : JSON.parse(req.body.toString("utf8")); } catch {}
    const itemId = payload?.inventory_item_id;
    const available = payload?.available;

    const result = await handleInventoryEvent(shop, itemId, available, { debug: false });
    console.log(`[WEBHOOK] inventory: item ${itemId} ->`, result);
    return res.sendStatus(200);
  } catch (e) {
    console.error("[WEBHOOK] inventory error:", e.message);
    return res.sendStatus(200);
  }
});

/* Utilities (no HMAC) */

router.get("/status", (_req, res) => res.json({ ok: true, route: "webhooks" }));

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

// Dev helpers
router.get("/dev/lookup", async (req, res) => {
  try {
    const shop = (req.query.shop || "").trim();
    const itemId = req.query.inventory_item_id;
    if (!shop || !itemId) return res.status(400).json({ ok: false, error: "Missing shop or inventory_item_id" });
    const subs = await findSubsByInventoryItem(shop, itemId);
    res.json({ ok: true, count: subs.length, subs });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post("/dev/trigger", async (req, res) => {
  try {
    const shop = (req.query.shop || "").trim();
    const itemId = req.query.inventory_item_id;
    const available = Number(req.query.available || "1");
    const debug = req.query.debug === "1";
    if (!shop || !itemId) return res.status(400).json({ ok: false, error: "Missing shop or inventory_item_id" });

    const result = await handleInventoryEvent(shop, itemId, available, { debug });
    res.json({ ok: true, result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
