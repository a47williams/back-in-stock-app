// routes/webhook.js
const express = require("express");
const crypto = require("crypto");
const axios = require("axios");
const router = express.Router();

const Subscriber = require("../models/Subscriber");
const { getAccessToken } = require("../utils/shopifyApi");

const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-04";

// Twilio
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN;
let twilioClient = null;
if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
  twilioClient = require("twilio")(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
}

/* ----------------------------- helpers ----------------------------- */

function verifyShopifyWebhook(req) {
  try {
    const hmacHeader = req.get("X-Shopify-Hmac-Sha256") || "";
    const raw = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(JSON.stringify(req.body || {}), "utf8");
    const digest = crypto.createHmac("sha256", SHOPIFY_API_SECRET).update(raw).digest("base64");
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}
function normalizeWp(n) { const s = String(n||"").trim(); return s.startsWith("whatsapp:") ? s : `whatsapp:${s}`; }

async function sendTemplatePing(to) {
  if (!twilioClient) throw new Error("Twilio client not configured");
  const from = normalizeWp(process.env.WHATSAPP_SENDER);
  const toWp = normalizeWp(to);
  const contentSid = (process.env.WHATSAPP_TEMPLATE_SID || "").trim();
  const msid = (process.env.WHATSAPP_MESSAGING_SERVICE_SID || "").trim();

  if (contentSid) {
    const payload = { from, to: toWp, contentSid };
    if (msid) payload.messagingServiceSid = msid;
    console.log("[WEBHOOK] send via Content SID:", contentSid.slice(0, 6)+"…", "msid:", !!msid);
    const resp = await twilioClient.messages.create(payload);
    return { sid: resp.sid, status: resp.status, via: "contentSid" };
  }

  // Fallback (session-only)
  const body = "The item you asked about is available again. Reply YES to get the link.";
  console.warn("[WEBHOOK] No WHATSAPP_TEMPLATE_SID — sending plain text fallback.");
  const resp = await twilioClient.messages.create({ from, to: toWp, body });
  return { sid: resp.sid, status: resp.status, via: "body" };
}

async function findSubsByInventoryItem(shop, inventoryItemId) {
  const shopKey = String(shop||"").toLowerCase();
  const raw = String(inventoryItemId||"").trim();
  const numeric = /^\d+$/.test(raw) ? String(Number(raw)) : null;
  const set = numeric && numeric !== raw ? [raw, numeric] : [raw];

  return Subscriber.find({
    shop: { $in: [shopKey, shop] },
    inventoryItemId: { $in: set },
  }).lean();
}

async function handleInventoryEvent(shop, inventoryItemId, available, { debug=false } = {}) {
  if (!shop || !inventoryItemId) return { notified:0, attempted:0, failures:[], reason:"missing_fields" };
  if (typeof available === "number" && available <= 0) return { notified:0, attempted:0, failures:[], reason:"not_available" };

  const subs = await findSubsByInventoryItem(shop, inventoryItemId);
  if (!subs.length) return { notified:0, attempted:0, failures:[], reason:"no_subscribers" };

  let ok = 0; const failures = [];
  for (const s of subs) {
    try {
      const resp = await sendTemplatePing(s.phone);
      console.log("[WEBHOOK] ping sent:", resp.sid, "via:", resp.via, "to:", s.phone);
      await Subscriber.updateOne({ _id: s._id }, { $set: { awaitingReply:true, templateSentAt:new Date() } });
      ok++;
    } catch (e) {
      const errMsg = e?.response?.data ? JSON.stringify(e.response.data) : e.message;
      console.error("[WEBHOOK] ping send error:", errMsg, "to:", s.phone);
      failures.push({ _id:String(s._id), phone:s.phone, error: errMsg });
    }
  }
  const result = { notified:ok, attempted:subs.length, failures, reason: ok>0 ? "ping_sent" : (failures.length?"twilio_failed":"unknown") };
  return debug ? result : { notified: result.notified, reason: result.reason };
}

/* ---------------------- in-memory debug logs ----------------------- */

const _logs = []; // ring buffer
function logEvent(entry) {
  const row = { ts: new Date().toISOString(), ...entry };
  _logs.push(row); if (_logs.length > 50) _logs.shift();
}

/* ----------------------------- routes ----------------------------- */

// Inventory webhook — use RAW body so HMAC is correct
router.post("/inventory", express.raw({ type: "application/json" }), async (req, res) => {
  const shop = req.get("X-Shopify-Shop-Domain") || "";
  const topic = req.get("X-Shopify-Topic") || "";
  const hmacOk = process.env.DISABLE_SHOPIFY_HMAC === "1" || verifyShopifyWebhook(req);

  logEvent({
    route:"/webhooks/inventory",
    shop, topic,
    len: Buffer.isBuffer(req.body) ? req.body.length : 0,
    hmacOk
  });

  if (!hmacOk) {
    console.warn("[WEBHOOK] inventory: HMAC failed");
    return res.sendStatus(401);
  }

  let payload = {};
  try { payload = JSON.parse(req.body.toString("utf8")); } catch {}
  const itemId = payload?.inventory_item_id;
  const available = payload?.available;

  console.log("[WEBHOOK] inventory payload:", { itemId, available, location_id: payload?.location_id });

  try {
    const result = await handleInventoryEvent(shop, itemId, available, { debug:false });
    console.log(`[WEBHOOK] inventory: item ${itemId} ->`, result);
    res.sendStatus(200);
  } catch (e) {
    console.error("[WEBHOOK] inventory error:", e.message);
    res.sendStatus(200);
  }
});

// Health
router.get("/status", (_req, res) => res.json({ ok:true, route:"webhooks" }));

// List registered webhooks
router.get("/list", async (req, res) => {
  try {
    const shop = (req.query.shop || "").trim();
    if (!shop) return res.status(400).json({ ok:false, error:"Missing shop" });

    const token = await getAccessToken(shop);
    const { data } = await axios.get(`https://${shop}/admin/api/${API_VERSION}/webhooks.json`, {
      headers: { "X-Shopify-Access-Token": token },
    });
    res.json({ ok:true, count:(data.webhooks||[]).length, webhooks:data.webhooks||[] });
  } catch (e) {
    res.status(500).json({ ok:false, error:e.message });
  }
});

// Register (or upsert) inventory_levels/update webhook to this host
router.post("/dev/register", async (req, res) => {
  try {
    const shop = (req.query.shop || "").trim();
    if (!shop) return res.status(400).json({ ok:false, error:"Missing shop" });
    const token = await getAccessToken(shop);
    const address = `${process.env.HOST}/webhooks/inventory`;

    // Delete any existing with same topic/address (cleanup)
    const { data: list } = await axios.get(`https://${shop}/admin/api/${API_VERSION}/webhooks.json`, {
      headers: { "X-Shopify-Access-Token": token },
    });
    const existing = (list.webhooks||[]).filter(w => w.topic === "inventory_levels/update");
    for (const w of existing) {
      if (w.address !== address) {
        await axios.delete(`https://${shop}/admin/api/${API_VERSION}/webhooks/${w.id}.json`, {
          headers: { "X-Shopify-Access-Token": token },
        });
      }
    }

    // Create/ensure webhook
    const payload = {
      webhook: {
        topic: "inventory_levels/update",
        address,
        format: "json",
      }
    };
    const { data: created } = await axios.post(`https://${shop}/admin/api/${API_VERSION}/webhooks.json`, payload, {
      headers: { "X-Shopify-Access-Token": token },
    });

    res.json({ ok:true, created: created.webhook || null, address });
  } catch (e) {
    res.status(500).json({ ok:false, error: e?.response?.data || e.message });
  }
});

// Dev env + logs + direct ping

router.get("/dev/env", (_req, res) => {
  res.json({
    ok:true,
    env: {
      TWILIO_ACCOUNT_SID: !!process.env.TWILIO_ACCOUNT_SID,
      TWILIO_AUTH_TOKEN:  !!process.env.TWILIO_AUTH_TOKEN,
      WHATSAPP_SENDER:    process.env.WHATSAPP_SENDER || null,
      WHATSAPP_TEMPLATE_SID: !!process.env.WHATSAPP_TEMPLATE_SID,
      WHATSAPP_MESSAGING_SERVICE_SID: !!process.env.WHATSAPP_MESSAGING_SERVICE_SID,
      DISABLE_SHOPIFY_HMAC: process.env.DISABLE_SHOPIFY_HMAC === "1",
      HOST: process.env.HOST || null
    }
  });
});

router.get("/dev/logs", (_req, res) => {
  res.json({ ok:true, logs:_logs });
});

router.post("/dev/ping", async (req, res) => {
  try {
    const to = (req.query.to || req.body?.to || "").trim();
    if (!to) return res.status(400).json({ ok:false, error:"Missing ?to=+E164" });
    const resp = await sendTemplatePing(to);
    res.json({ ok:true, resp });
  } catch (e) {
    res.status(500).json({ ok:false, error: e?.response?.data || e.message });
  }
});

router.post("/dev/trigger", async (req, res) => {
  try {
    const shop = (req.query.shop || "").trim();
    const itemId = req.query.inventory_item_id;
    const available = Number(req.query.available || "1");
    const debug = req.query.debug === "1";
    if (!shop || !itemId) return res.status(400).json({ ok:false, error:"Missing shop or inventory_item_id" });
    const result = await handleInventoryEvent(shop, itemId, available, { debug });
    res.json({ ok:true, result });
  } catch (e) {
    res.status(500).json({ ok:false, error:e.message });
  }
});

module.exports = router;
