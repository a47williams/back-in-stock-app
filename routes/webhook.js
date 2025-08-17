// back-in-stock-app/routes/webhook.js
const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const Alert = require('../models/Alert');
const sendWhatsApp = require('../utils/sendWhatsApp');

/**
 * Verify Shopify HMAC for webhooks.
 * We signed the raw request body with SHOPIFY_API_SECRET and compare to header.
 */
function verifyShopifyWebhook(req, res, next) {
  try {
    const hmacHeader = req.get('X-Shopify-Hmac-Sha256') || '';
    const secret = process.env.SHOPIFY_API_SECRET;

    // req.body is a Buffer because of express.raw() in server.js
    const computed = crypto
      .createHmac('sha256', secret)
      .update(req.body)
      .digest('base64');

    // timing-safe compare
    const ok =
      hmacHeader.length &&
      crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hmacHeader));

    if (!ok) return res.status(401).send('Unauthorized');
    return next();
  } catch (e) {
    return res.status(401).send('Unauthorized');
  }
}

/**
 * Shopify posts products/update here.
 * We parse the raw body after HMAC verification, then notify for any variants
 * that have inventory_quantity > 0 and pending alerts.
 */
router.post('/inventory', verifyShopifyWebhook, async (req, res) => {
  try {
    const payload = JSON.parse(req.body.toString('utf8'));
    const title = payload?.title || 'Your item';
    const variants = Array.isArray(payload?.variants) ? payload.variants : [];

    for (const v of variants) {
      const variantId = String(v.id);
      const qty = Number(v.inventory_quantity ?? 0);

      if (qty > 0) {
        const pending = await Alert.find({ variantId, sent: false });

        for (const alert of pending) {
          // inside for (const alert of pending) { ... }
if (alert.phone) {
  await sendWhatsApp(
    alert.phone,
    `🔔 Back in stock: ${title}\nVariant ID: ${variantId}\nGrab it before it sells out again!`
  );
}

          // (Optional) send email fallback here

          alert.sent = true;
          await alert.save();
        }
      }
    }

    return res.status(200).send('OK');
  } catch (err) {
    console.error('Webhook processing error:', err);
    return res.status(500).send('Error');
  }
});

module.exports = router;
