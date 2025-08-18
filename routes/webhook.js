// routes/webhook.js
const express = require('express');
const crypto = require('crypto');
const Alert = require('../models/Alert');
const sendWhatsApp = require('../utils/sendWhatsApp');

const router = express.Router();

const SKIP_HMAC = process.env.SKIP_HMAC === 'true';

/** Normalize numeric ID from number or gid://shopify/.../123 */
function normId(id) {
  if (id == null) return null;
  const s = String(id);
  const m = s.match(/(\d+)$/);
  return m ? m[1] : s;
}

/** Verify Shopify HMAC against RAW bytes in req.body (Buffer) */
function verifyHmac(req) {
  if (SKIP_HMAC) return true;
  const secret = (process.env.SHOPIFY_API_SECRET || '').trim();
  const header = req.get('X-Shopify-Hmac-Sha256') || '';
  const raw = req.body; // Buffer from express.raw() in server.js
  if (!secret || !header || !Buffer.isBuffer(raw)) return false;
  const computed = crypto.createHmac('sha256', secret).update(raw).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(computed));
  } catch {
    return false;
  }
}

/**
 * POST /webhook/inventory
 * Handles:
 *  - products/update → inspect product.variants[] for inventory_quantity > 0, match alerts by variantId
 *  - inventory_levels/update → optional (if you store inventory_item_id)
 */
router.post('/inventory', async (req, res) => {
  const topic = req.get('X-Shopify-Topic') || '';
  const shop  = req.get('X-Shopify-Shop-Domain') || '';

  console.log('🪝 /webhook/inventory', {
    topic,
    shop,
    hmac: !!req.get('X-Shopify-Hmac-Sha256'),
    len: Buffer.isBuffer(req.body) ? req.body.length : 0,
  });

  // HMAC
  if (!verifyHmac(req)) {
    console.warn('❌ HMAC invalid');
    return res.status(401).send('unauthorized');
  }

  // Parse JSON AFTER HMAC (req.body is Buffer here)
  let payload = {};
  try {
    payload = JSON.parse(req.body.toString('utf8') || '{}');
  } catch (e) {
    console.error('❌ JSON parse error on webhook body:', e.message);
    return res.status(400).send('bad json');
  }

  try {
    // ---------- PRODUCTS/UPDATE ----------
    if (topic === 'products/update') {
      const product = payload || {};
      const handle  = product.handle || '';
      const title   = product.title || 'Your item';
      const variants = Array.isArray(product.variants) ? product.variants : [];

      const inStockVariantIds = variants
        .filter(v => {
          if (typeof v.inventory_quantity === 'number') return v.inventory_quantity > 0;
          if (typeof v.available === 'boolean') return v.available === true;
          return false;
        })
        .map(v => normId(v.id))
        .filter(Boolean);

      if (!inStockVariantIds.length) {
        console.log('ℹ️ products/update: no variants in stock');
        return res.status(200).send('ok');
      }

      const matchQuery = {
        variantId: { $in: inStockVariantIds },
        sent: { $ne: true },
        $or: [{ shop }, { shop: { $exists: false } }, { shop: null }],
      };

      const alerts = await Alert.find(matchQuery);
      console.log(`🔎 products/update: inStock=${inStockVariantIds.join(',')} | pending=${alerts.length}`);

      for (const a of alerts) {
        try {
          const url = `https://${shop}/products/${handle}?variant=${a.variantId}`;
          const msg = `✅ Back in stock: ${title}\n${url}`;
          const resp = await sendWhatsApp(a.phone, msg);
          if (resp?.ok) {
            a.sent = true;
            await a.save();
            console.log('📲 Notified', a.phone, 'variant', a.variantId);
          } else {
            console.warn('⚠️ WhatsApp send failed', a.phone, resp?.error || 'unknown');
          }
        } catch (err) {
          console.error('💥 Notify error', a.phone, err.message || err);
        }
      }

      return res.status(200).send('ok');
    }

    // ---------- INVENTORY LEVELS UPDATE (optional) ----------
    if (topic === 'inventory_levels/update') {
      const inventory_item_id = normId(payload.inventory_item_id);
      const available = Number(payload.available ?? 0);
      console.log('📦 inventory_levels/update parsed', { inventory_item_id, available });

      if (!inventory_item_id || !(available > 0)) {
        console.log('ℹ️ inventory not positive or missing id');
        return res.status(200).send('ok');
      }

      const alerts = await Alert.find({
        inventory_item_id,
        sent: { $ne: true },
        $or: [{ shop }, { shop: { $exists: false } }, { shop: null }],
      });

      console.log(`🔎 inventory_levels/update: pending=${alerts.length}`);

      for (const a of alerts) {
        try {
          const msg = `✅ An item you wanted is back in stock: https://${shop}`;
          const resp = await sendWhatsApp(a.phone, msg);
          if (resp?.ok) {
            a.sent = true;
            await a.save();
            console.log('📲 Notified', a.phone, 'inv_item', inventory_item_id);
          } else {
            console.warn('⚠️ WhatsApp send failed', a.phone, resp?.error || 'unknown');
          }
        } catch (err) {
          console.error('💥 Notify error', a.phone, err.message || err);
        }
      }

      return res.status(200).send('ok');
    }

    console.log('ℹ️ Unhandled topic:', topic);
    return res.status(200).send('ok');
  } catch (err) {
    console.error('💥 webhook handler error:', err);
    return res.status(200).send('ok'); // 200 to avoid retries while debugging
  }
});

module.exports = router;
