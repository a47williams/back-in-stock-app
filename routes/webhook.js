// routes/webhook.js
const express = require('express');
const crypto = require('crypto');

const router = express.Router();

/**
 * Verify Shopify HMAC using raw body.
 * NOTE: express.raw() must be mounted in server.js BEFORE this router.
 */
function verifyHmac(req) {
  try {
    const hmacHeader = req.get('X-Shopify-Hmac-Sha256') || '';
    const rawBody = req.body; // Buffer from express.raw
    const digest = crypto
      .createHmac('sha256', process.env.SHOPIFY_API_SECRET || '')
      .update(rawBody, 'utf8')
      .digest('base64');

    // timingSafeEqual only if both buffers same length
    if (hmacHeader.length !== digest.length) return false;
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}

/**
 * TEMP debug endpoint to prove the router is reachable without HMAC.
 * You can create a webhook pointing to /webhook/ping or curl it directly.
 */
router.post('/ping', express.json(), (req, res) => {
  console.log('🔔 /webhook/ping hit', { body: req.body });
  return res.status(200).json({ ok: true });
});

/**
 * Inventory webhook (Shopify "Inventory levels update").
 * Expects raw JSON body; we verify HMAC unless SKIP_HMAC=true in env.
 */
router.post('/inventory', async (req, res) => {
  try {
    console.log('📦 /webhook/inventory received', {
      topic: req.get('X-Shopify-Topic'),
      shop: req.get('X-Shopify-Shop-Domain'),
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

    // Parse after (or instead of) verification
    const payload = JSON.parse(req.body.toString('utf8'));
    console.log('🧾 inventory payload keys:', Object.keys(payload));

    // TODO: tie this payload to your alert logic (variant / inventory_item mapping)
    // For Fix A we only prove routing/logging works:
    console.log('✅ inventory webhook processed');
    return res.status(200).send('ok');
  } catch (err) {
    console.error('💥 inventory handler error:', err);
    return res.status(500).send('error');
  }
});

module.exports = router;
