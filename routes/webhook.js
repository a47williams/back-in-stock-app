// routes/webhook.js
const express = require('express');
const crypto = require('crypto');
const Alert = require('../models/Alert');
const sendWhatsApp = require('../utils/sendWhatsApp');

const router = express.Router();
const SKIP_HMAC = process.env.SKIP_HMAC === 'true';

function verifyHmac(req) {
  if (SKIP_HMAC) return true;
  const secret = (process.env.SHOPIFY_API_SECRET || '').trim();
  const hmacHeader = req.get('X-Shopify-Hmac-Sha256') || '';
  const raw = req.rawBody;
  if (!secret || !hmacHeader || !raw) return false;
  const computed = crypto.createHmac('sha256', secret).update(raw).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(hmacHeader), Buffer.from(computed));
  } catch { return false; }
}

// raw body collector (for HMAC)
router.use((req, _res, next) => {
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    req.rawBody = Buffer.concat(chunks);
    try { req.body = JSON.parse(req.rawBody.toString('utf8') || '{}'); }
    catch { req.body = {}; }
    next();
  });
});

// Main webhook
router.post('/inventory', async (req, res) => {
  const topic = req.get('X-Shopify-Topic');
  const shop  = req.get('X-Shopify-Shop-Domain');

  console.log('🪝 /webhook/inventory', { topic, shop, hmac: !!req.get('X-Shopify-Hmac-Sha256') });

  if (!verifyHmac(req)) {
    console.warn('❌ HMAC invalid');
    return res.status(401).send('unauthorized');
  }

  try {
    if (topic === 'products/update') {
      const product = req.body;
      const variants = Array.isArray(product?.variants) ? product.variants : [];
      const inStockVariantIds = variants
        .filter(v => (typeof v.inventory_quantity === 'number' ? v.inventory_quantity > 0 : !!v.available))
        .map(v => String(v.id).match(/(\d+)$/)?.[1] || String(v.id));

      if (!inStockVariantIds.length) {
        console.log('ℹ️ products/update: no in-stock variants');
        return res.status(200).send('ok');
      }

      const pending = await Alert.find({
        shop,
        variantId: { $in: inStockVariantIds },
        sent: { $ne: true },
      });

      console.log(`🔎 products/update: in-stock=${inStockVariantIds.join(', ')}; pending=${pending.length}`);

      for (const a of pending) {
        const url = `https://${shop}/products/${product?.handle || ''}?variant=${a.variantId}`;
        const ok = await sendWhatsApp(a.phone, `✅ Back in stock: ${product?.title || 'Your item'}\n${url}`);
        if (ok?.ok) { a.sent = true; await a.save(); console.log('📲 Notified', a.phone, a.variantId); }
        else { console.warn('⚠️ Send failed', a.phone, ok?.error || 'unknown'); }
      }
      return res.status(200).send('ok');
    }

    if (topic === 'inventory_levels/update') {
      const inventory_item_id = String(req.body?.inventory_item_id || '');
      const available = Number(req.body?.available ?? 0);
      if (!inventory_item_id || available <= 0) {
        console.log('ℹ️ inventory level not positive or missing id');
        return res.status(200).send('ok');
      }
      const pending = await Alert.find({ shop, inventory_item_id, sent: { $ne: true } });
      console.log(`🔎 inventory_levels/update: pending=${pending.length}`);
      for (const a of pending) {
        const ok = await sendWhatsApp(a.phone, `✅ An item you wanted is back in stock: https://${shop}`);
        if (ok?.ok) { a.sent = true; await a.save(); console.log('📲 Notified', a.phone); }
      }
      return res.status(200).send('ok');
    }

    console.log('ℹ️ Unhandled topic', topic);
    res.status(200).send('ok');
  } catch (e) {
    console.error('💥 webhook error', e);
    res.status(200).send('ok'); // 200 so Shopify doesn’t retry loop
  }
});

module.exports = router;
