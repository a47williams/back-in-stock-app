// routes/webhook.js
const express = require('express');
const crypto = require('crypto');
const Alert = require('../models/Alert');
const sendWhatsApp = require('../utils/sendWhatsApp');

const router = express.Router();

// ---- CONFIG ----
const SKIP_HMAC = process.env.SKIP_HMAC === 'true';

/**
 * Verify Shopify HMAC against the RAW request body bytes.
 */
function verifyHmac(req) {
  if (SKIP_HMAC) return true;
  const secret = (process.env.SHOPIFY_API_SECRET || '').trim();
  const hmacHeader = req.get('X-Shopify-Hmac-Sha256') || '';
  const raw = req.rawBody;
  if (!secret || !hmacHeader || !raw) return false;
  const computed = crypto.createHmac('sha256', secret).update(raw).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(hmacHeader), Buffer.from(computed));
  } catch {
    return false;
  }
}

/**
 * Collect RAW body so we can both verify HMAC and parse JSON safely.
 */
router.use((req, _res, next) => {
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    req.rawBody = Buffer.concat(chunks);
    try {
      req.body = JSON.parse(req.rawBody.toString('utf8') || '{}');
    } catch {
      req.body = {};
    }
    next();
  });
});

/**
 * Utility: normalize numeric ID from number or gid://shopify/.../123
 */
function normId(id) {
  if (id == null) return null;
  const s = String(id);
  const m = s.match(/(\d+)$/);
  return m ? m[1] : s;
}

/**
 * POST /webhook/inventory
 * Handles both:
 *  - products/update  → inspect variants[] for inventory_quantity > 0, match alerts by variantId
 *  - inventory_levels/update → (optional) match alerts by inventory_item_id if you store it
 */
router.post('/inventory', async (req, res) => {
  const topic = req.get('X-Shopify-Topic') || '';
  const shop  = req.get('X-Shopify-Shop-Domain') || '';

  console.log('🪝 /webhook/inventory', {
    topic,
    shop,
    hmac: !!req.get('X-Shopify-Hmac-Sha256'),
    len: req.rawBody?.length || 0
  });

  if (!verifyHmac(req)) {
    console.warn('❌ HMAC invalid');
    return res.status(401).send('unauthorized');
  }

  try {
    // ---------- PRODUCTS/UPDATE PATH (recommended for MVP) ----------
    if (topic === 'products/update') {
      const product = req.body || {};
      const handle  = product.handle || '';
      const title   = product.title || 'Your item';
      const variants = Array.isArray(product.variants) ? product.variants : [];

      // Find variants now in stock
      const inStockVariantIds = variants
        .filter(v => {
          // Prefer inventory_quantity (number). If missing, fallback to boolean available flag.
          if (typeof v.inventory_quantity === 'number') return v.inventory_quantity > 0;
          if (typeof v.available === 'boolean') return v.available === true;
          return false;
        })
        .map(v => normId(v.id))
        .filter(Boolean);

      if (!inStockVariantIds.length) {
        console.log('ℹ️ products/update: no variants in stock → nothing to do.');
        return res.status(200).send('ok');
      }

      // Query pending alerts by variantId.
      // IMPORTANT: Early signups may have no shop stored; include those too.
      const matchQuery = {
        variantId: { $in: inStockVariantIds },
        sent: { $ne: true },
        $or: [{ shop }, { shop: { $exists: false } }, { shop: null }]
      };

      const alerts = await Alert.find(matchQuery);
      console.log(`🔎 products/update: inStock=${inStockVariantIds.join(',')} | pendingMatches=${alerts.length}`);

      // Send WhatsApp + mark sent
      for (const a of alerts) {
        try {
          const url = `https://${shop}/products/${handle}?variant=${a.variantId}`;
          const msg = `✅ Back in stock: ${title}\n${url}`;
          const resSend = await sendWhatsApp(a.phone, msg);
          if (resSend?.ok) {
            a.sent = true;
            await a.save();
            console.log('📲 Notified', a.phone, 'variant', a.variantId);
          } else {
            console.warn('⚠️ WhatsApp send failed', a.phone, resSend?.error || 'unknown');
          }
        } catch (e) {
          console.error('💥 Notify error', a.phone, e.message || e);
        }
      }

      return res.status(200).send('ok');
    }

    // ---------- INVENTORY LEVELS UPDATE (optional; requires saving inventory_item_id on signup) ----------
    if (topic === 'inventory_levels/update') {
      const payload = req.body || {};
      const inventory_item_id = normId(payload.inventory_item_id);
      const available = Number(payload.available ?? 0);

      console.log('📦 inventory_levels/update parsed', { inventory_item_id, available });

      if (!inventory_item_id || !(available > 0)) {
        console.log('ℹ️ inventory level not positive or missing id → skip.');
        return res.status(200).send('ok');
      }

      const alerts = await Alert.find({
        inventory_item_id,
        sent: { $ne: true },
        $or: [{ shop }, { shop: { $exists: false } }, { shop: null }]
      });

      console.log(`🔎 inventory_levels/update: pendingMatches=${alerts.length}`);

      for (const a of alerts) {
        try {
          const msg = `✅ An item you wanted is back in stock: https://${shop}`;
          const resSend = await sendWhatsApp(a.phone, msg);
          if (resSend?.ok) {
            a.sent = true;
            await a.save();
            console.log('📲 Notified', a.phone, 'inv_item', inventory_item_id);
          } else {
            console.warn('⚠️ WhatsApp send failed', a.phone, resSend?.error || 'unknown');
          }
        } catch (e) {
          console.error('💥 Notify error', a.phone, e.message || e);
        }
      }

      return res.status(200).send('ok');
    }

    // Unknown / other topics
    console.log('ℹ️ Unhandled topic:', topic);
    return res.status(200).send('ok');
  } catch (err) {
    console.error('💥 webhook handler error:', err);
    return res.status(200).send('ok'); // 200 to avoid Shopify retry storms during debugging
  }
});

module.exports = router;
