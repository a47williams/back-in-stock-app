// routes/webhook.js
const express = require("express");
const crypto = require("crypto");
const axios = require("axios");
const router = express.Router();

const Subscriber = require("../models/Subscriber");
const { registerWebhooks } = require("../utils/registerWebhooks");
const { getAccessToken } = require("../utils/shopifyApi");

/* ====== ENV ====== */
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-04";

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const WHATSAPP_SENDER = process.env.WHATSAPP_SENDER;               // e.g. "whatsapp:+16037165050" (we normalize anyway)
const WHATSAPP_TEMPLATE_SID = process.env.WHATSAPP_TEMPLATE_SID;   // e.g. "HXxxxxxxxxxxxxxxxxxxxx"
const WHATSAPP_MESSAGING_SERVICE_SID = process.env.WHATSAPP_MESSAGING_SERVICE_SID; // optional MG SID

/* ====== Twilio client ====== */
let twilioClient = null;
if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
  twilioClient = require("twilio")(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
}

/* ====== Helpers ====== */

function verifyShopifyWebhook(req) {
  try {
    const hmacHeader = req.get("X-Shopify-Hmac-Sha256") || "";
    const digest = crypto.createHmac("sha256", SHOPIFY_API_SECRET)
      .update(req.body) // MUST be Buffer; mount router with express.raw({ type: "application/json" })
      .digest("base64");
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}

function normalizeShop(shop) {
  return String(shop || "").trim().toLowerCase();
}

/**
 * Normalize WhatsApp "from" and "to" addresses and send a message.
 * Uses Content API with an approved template if WHATSAPP_TEMPLATE_SID is set.
 * Falls back to a simple body (may fail outside 24h window).
 */
async function sendWhatsApp(to, variables = {}) {
  if (!twilioClient) throw new Error("Twilio client not configured");
  if (!WHATSAPP_SENDER && !WHATSAPP_MESSAGING_SERVICE_SID) {
    throw new Error("Missing WHATSAPP_SENDER or WHATSAPP_MESSAGING_SERVICE_SID");
  }

  const fromRaw = String(WHATSAPP_SENDER || "").trim();
  const from = fromRaw ? (fromRaw.startsWith("whatsapp:") ? fromRaw : `whatsapp:${fromRaw}`) : null;
  const toRaw = String(to || "").trim();
  const toWp = toRaw.startsWith("whatsapp:") ? toRaw : `whatsapp:${toRaw}`;

  // Prefer Content API (approved template)
  if (WHATSAPP_TEMPLATE_SID) {
    const payload = {
      to: toWp,
      contentSid: WHATSAPP_TEMPLATE_SID,
      contentVariables: JSON.stringify(variables || {}),
    };
    if (WHATSAPP_MESSAGING_SERVICE_SID) {
      payload.messagingServiceSid = WHATSAPP_MESSAGING_SERVICE_SID;
    } else {
      payload.from = from; // direct sender
    }
    const resp = await twilioClient.messages.create(payload);
    return { sid: resp.sid, status: resp.status };
  }

  // Fallback: free-text (works only in 24h customer window)
  const body = variables?.["1"]
    ? `Good news! "${variables["1"]}" is back in stock.`
    : "Good news! Your item is back in stock.";
  const payload = { to: toWp, body };
  if (WHATSAPP_MESSAGING_SERVICE_SID) {
    payload.messagingServiceSid = WHATSAPP_MESSAGING_SERVICE_SID;
  } else {
    payload.from = from;
  }
  const resp = await twilioClient.messages.create(payload);
  return { sid: resp.sid, status: resp.status };
}

/** Find subscribers by shop + inventory_item_id (handles string/number + shop case) */
async function findSubsByInventoryItem(shop, inventoryItemId) {
  const shopNorm = normalizeShop(shop);
  const sid = String(inventoryItemId || "").trim();
  const numericCandidate = /^\d+$/.test(sid) ? String(Number(sid)) : null;
  const inSet = [sid];
  if (numericCandidate && numericCandidate !== sid) inSet.push(numericCandidate);

  return Subscriber.find({
    shop: { $in: [shop, shopNorm] },
    inventoryItemId: { $in: inSet },
  }).lean();
}

/**
 * Notify subscribers and optionally return detailed results for debugging.
 * @returns { notified, attempted, failures: [{_id, phone, error}], reason }
 */
async function handleInventoryEvent(shop, inventoryItemId, available, { debug = false } = {}) {
  if (!shop || !inventoryItemId) return { notified: 0, attempted: 0, failures: [], reason: "missing_fields" };
  if (typeof available === "number" && available <= 0) return { notified: 0, attempted: 0, failures: [], reason: "not_available" };

  const subs = await findSubsByInventoryItem(shop, inventoryItemId);
  if (!subs.length) return { notified: 0, attempted: 0, failures: [], reason: "no_subscribers" };

  let ok = 0;
  const failures = [];

  for (const s of subs) {
    try {
      const vars = {
        1: s.productTitle || "Your item",
        2: s.productUrl || "",
      };
      const resp = await sendWhatsApp(s.phone, vars);
      console.log("[WEBHOOK] Twilio sent SID:", resp.sid, "status:", resp.status, "to:", s.phone);
      await Subscriber.deleteOne({ _id: s._id }); // delete after send to avoid re-sending
      ok++;
    } catch (e) {
      const errMsg = e?.response?.data ? JSON.stringify(e.response.data) : e.message;
      console.error("[WEBHOOK] Twilio send error:", errMsg, "to:", s.phone);
      failures.push({ _id: String(s._id), phone: s.phone, error: errMsg });
      // keep sub for retry later
    }
  }

  const result = {
    notified: ok,
    attempted: subs.length,
    failures,
    reason: ok > 0 ? "sent" : (failures.length ? "twilio_failed" : "unknown"),
  };
  return debug ? result : { notified: result.notified, reason: result.reason };
}

/* ====== HMAC-verified Shopify webhook handlers ====== */

/**
 * Topic: inventory_levels/update
 * URL:   POST /webhooks/inventory
 * NOTE: Mount with express.raw({ type: "application/json" }) in server.js
 */
router.post("/inventory", async (req, res) => {
  try {
    if (!verifyShopifyWebhook(req)) {
      console.warn("[WEBHOOK] inventory: HMAC failed");
      return res.sendStatus(401);
    }
    const shop = req.get("X-Shopify-Shop-Domain") || "";
    let payload = {};
    try { payload = JSON.parse(req.body.toString("utf8")); } catch {}

    const itemId = payload?.inventory_item_id;
    const available = payload?.available;

    const result = await handleInventoryEvent(shop, itemId, available, { debug: false });
    console.log(`[WEBHOOK] inventory: item ${itemId} ->`, result);
    return res.sendStatus(200);
  } catch (e) {
    console.error("[WEBHOOK] inventory error:", e.message);
    return res.sendStatus(200); // ack to stop retries
  }
});

/* ====== Utilities (no HMAC) ====== */

// Health
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

// (Re)register webhooks right now
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

// Dev: lookup subs for an inventory_item_id (diagnostic)
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

// Dev: simulate a restock (no HMAC). Add &debug=1 to see per-subscriber failures.
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
