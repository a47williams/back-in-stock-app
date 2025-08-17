// routes/webhook.js
const express = require('express');
const crypto = require('crypto');
const Alert = require('../models/Alert');
const sendWhatsApp = require('../utils/sendWhatsApp');

const router = express.Router();

// Verify Shopify HMAC using raw body (express.raw is mounted in server.js)
function verifyHmac(req) {
  try {
    const hmacHeader = req.get('X-Shopify-Hmac-Sha256') || '';
    const rawBody = req.body; // Buffer from express.raw
    const digest = crypto
      .createHmac('sha256', process.env.SHOPIFY_API_SECRET || '')
      .update(rawBody, 'utf8')
      .digest('base64');

    if (hmacHeader.length !== digest.length) return false;
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}

// Debug route (no HMAC)
router.post('/ping', express.json(), (req, res) => {
  console.log('🔔 /webhook/ping hit', { body: req.body });
  return res.status(200).json({ ok: true });
});

// Inventory levels update webhook
router.post('/inventory', async (req, res) => {
  try {
    const topic = req.get('X-Shopify-Topic');
    const shop = req.get('X-Shopify-Shop-Domain');

    console.log('📦 /webhook/inventory received', {
      topic,
      shop,
      hmacPresent: !!req.get('X-Shopify-Hmac-Sha256'),
      length: req.get('content-length'),
    });

    if (!process.env.SKIP_HMAC) {
      if (!verifyHmac(req)) {
        console.error('❌ HMAC invalid or missing');
        return res.status(401).send('Unauthorized');
      }
    } else {
      console.warn('⚠️ HMAC verification skipped (SKIP_HMAC=true)');
    }

    // Parse payload
    const payload = JSON.parse(req.body.toString('utf8'));
    // Inventory webhook payloads include inventory_item_id and available (or adjustment)
    const inventory_item_id = String(payload.inventory_item_id || '');
    const available = Number(payload.available ?? 0);

    console.log(`🧾 Parsed: inventory_item_id=${inventory_item_id}, available=${available}`);

    if (!inventory_item_id) {
      console.warn('No inventory_item_id on payload — nothing to do.');
      return res.status(200).send('ok');
    }

    if (available <= 0) {
      console.log('Inventory not positive; skip notifications.');
      return res.status(200).send('ok');
    }

    // Find alerts for this inventory item, not already sent
    const match = { inventory_item_id, sent: false };
    if (shop) match.shop = shop; // if Shopify sent shop header, narrow by shop

    const alerts = await Alert.find(match);
    console.log(`🔎 Found ${alerts.length} pending alert(s) for ${inventory_item_id}`);

    // Send WhatsApp + mark as sent
    for (const a of alerts) {
      try {
        const msg = `✅ Back in stock! Your item is available again. (Variant ${a.variantId})`;
        const ok = await sendWhatsApp(a.phone, msg);
        if (ok) {
          a.sent = true;
          await a.save();
          console.log(`📲 Notified ${a.phone} for variant ${a.variantId}`);
        } else {
          console.warn(`⚠️ WhatsApp send failed for ${a.phone}`);
        }
      } catch (err) {
        console.error('💥 Notify error:', err.message || err);
      }
    }

    return res.status(200).send('ok');
  } catch (err) {
    console.error('💥 inventory handler error:', err);
    return res.status(500).send('error');
  }
});

module.exports = router;
