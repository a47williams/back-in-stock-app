// routes/webhook.js
const express = require('express');
const crypto = require('crypto');

const Alert = require('../models/Alert');
const sendWhatsApp = require('../utils/sendWhatsApp');

const router = express.Router();

/**
 * Verify Shopify webhook HMAC using the RAW request body (Buffer).
 * IMPORTANT: server.js must mount express.raw({ type: 'application/json' }) for /webhook routes.
 */
function verifyHmac(req) {
  try {
    const hmacHeader = req.get('X-Shopify-Hmac-Sha256') || '';
    const secret = (process.env.SHOPIFY_API_SECRET || '').trim();
    const rawBody = req.body; // Buffer (thanks to express.raw in server.js)

    if (!hmacHeader || !secret || !rawBody) return false;

    const computed = crypto.createHmac('sha256', secret).update(rawBody).digest(); // Buffer
    const received = Buffer.from(hmacHeader, 'base64'); // Buffer

    if (received.length !== computed.length) return false;
    return crypto.timingSafeEqual(received, computed);
  } catch {
    return false;
  }
}

/** Safely parse JSON from Buffer -> object */
function parseBody(req) {
  try {
    if (Buffer.isBuffer(req.body)) {
      return JSON.parse(req.body.toString('utf8'));
    }
    if (typeof req.body === 'string') {
      return JSON.parse(req.body);
    }
    return req.body || {};
  } catch (e) {
    console.error('❌ JSON parse error:', e.message);
    return {};
  }
}

// Simple ping for debugging
router.post('/ping', express.json(), (req, res) => {
  console.log('🔔 /webhook/ping', req.body);
  res.status(200).json({ ok: true });
});

router.post('/inventory', async (req, res) => {
  const topic = req.get('X-Shopify-Topic');
  const shop = req.get('X-Shopify-Shop-Domain') || null;
  const hmacPresent = !!req.get('X-Shopify-Hmac-Sha256');
  const len = req.get('content-length');
  console.log('📦 /webhook/inventory received {',
    '\n  topic:', `'${topic}'`,
    ',\n  shop:', `'${shop}'`,
    ',\n  hmacPresent:', hmacPresent,
    ',\n  length:', `'${len}'`,
    '\n}');

  try {
    // HMAC verification (can bypass with SKIP_HMAC=true while testing)
    if (!process.env.SKIP_HMAC) {
      if (!verifyHmac(req)) {
        console.error('❌ HMAC invalid or missing');
        return res.status(401).send('Unauthorized');
      }
    } else {
      console.warn('⚠️ HMAC verification skipped (SKIP_HMAC=true)');
    }

    // Parse body AFTER HMAC verification
    const body = parseBody(req);
    // Log keys to understand shape if needed
    // console.log('🔎 payload keys:', Object.keys(body));

    // Shopify inventory_levels/update typically provides these at top level
    let inventory_item_id = body?.inventory_item_id ?? null;
    let available = body?.available ?? null;

    // Fallbacks (some test payloads differ)
    if (!inventory_item_id && body?.inventory_item?.id) {
      inventory_item_id = body.inventory_item.id;
    }
    if (available === null && typeof body?.available_adjustment === 'number') {
      // Not a perfect substitute, but helps with certain test payloads
      available = body.available_adjustment;
    }

    if (!inventory_item_id) {
      console.warn('ℹ️  No inventory_item_id on payload — nothing to do.');
      return res.status(200).json({ ok: true, skipped: true });
    }

    inventory_item_id = String(inventory_item_id);
    const availNum = Number(available);

    console.log(`🧾 Parsed: inventory_item_id=${inventory_item_id}, available=${isNaN(availNum) ? 'unknown' : availNum}`);

    if (!Number.isFinite(availNum) || availNum <= 0) {
      console.log('ℹ️  Availability not positive/unknown; skip notifications.');
      return res.status(200).json({ ok: true, skipped: true });
    }

    // Find matching alerts (optionally scoped by shop)
    const match = { inventory_item_id, sent: false };
    if (shop) match.shop = shop;

    const alerts = await Alert.find(match);
    console.log(`🔎 Found ${alerts.length} pending alert(s) for inventory_item_id=${inventory_item_id}`);

    for (const a of alerts) {
      try {
        const msg = `✅ Back in stock! Variant ${a.variantId} is available again.`;
        const ok = await sendWhatsApp(a.phone, msg);
        if (ok) {
          a.sent = true;
          await a.save();
          console.log(`📲 Notified ${a.phone}`);
        } else {
          console.warn(`⚠️ WhatsApp send returned false for ${a.phone}`);
        }
      } catch (err) {
        console.error('💥 Notify error for', a.phone, err.message || err);
      }
    }

    return res.status(200).json({ ok: true, notified: alerts.length });
  } catch (err) {
    console.error('💥 inventory handler error:', err);
    return res.status(500).json({ error: 'handler_failed' });
  }
});

module.exports = router;
