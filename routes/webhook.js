// routes/webhook.js
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const Alert = require('../models/Alert');
const sendWhatsApp = require('../utils/sendWhatsApp');

// Toggle HMAC verification by env (use false in dev if needed)
const SKIP_HMAC = (process.env.SKIP_HMAC === 'true');

// Util: verify webhook HMAC
function verifyHmac(req) {
  if (SKIP_HMAC) return true;
  const secret = process.env.SHOPIFY_API_SECRET;
  const hmacHeader = req.get('X-Shopify-Hmac-Sha256') || '';
  const body = req.rawBody; // must be set by upstream middleware
  if (!secret || !hmacHeader || !body) return false;
  const digest = crypto
    .createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('base64');
  return crypto.timingSafeEqual(Buffer.from(hmacHeader), Buffer.from(digest));
}

// Middleware to collect raw body for HMAC
router.use((req, res, next) => {
  let data = [];
  req.on('data', chunk => data.push(chunk));
  req.on('end', () => {
    req.rawBody = Buffer.concat(data);
    try {
      req.body = JSON.parse(req.rawBody.toString('utf8') || '{}');
    } catch {
      req.body = {};
    }
    next();
  });
});

/**
 * POST /webhook/inventory
 * Subscribed topics: products/update, inventory_levels/update
 * Strategy:
 *  - products/update: iterate variants; if available > 0, notify alerts by variantId.
 *  - inventory_levels/update: (optional) only used if you also saved inventory_item_id.
 */
router.post('/inventory', async (req, res) => {
  try {
    const valid = verifyHmac(req);
    const topic = req.get('X-Shopify-Topic');
    const shop  = req.get('X-Shopify-Shop-Domain');

    console.log('🪝 /webhook/inventory received {',
      '\n  topic:', JSON.stringify(topic),
      ',\n  shop:', JSON.stringify(shop),
      ',\n  hmacPresent:', !!req.get('X-Shopify-Hmac-Sha256'),
      ',\n  length:', String(req.rawBody?.length || '0'),
      '\n}');

    if (!valid) {
      console.warn('❌ HMAC invalid or missing');
      return res.status(401).send('unauthorized');
    }

    // Handle products/update — best for our no-Admin-token flow
    if (topic === 'products/update') {
      const product = req.body;
      const variants = Array.isArray(product?.variants) ? product.variants : [];

      // Build list of in-stock variantIds
      const inStockVariantIds = variants
        .filter(v => {
          // prefer inventory_quantity > 0; some themes rely on available flag
          const qty = typeof v.inventory_quantity === 'number' ? v.inventory_quantity : null;
          const available = (v?.available === true); // not always present
          return (qty !== null ? qty > 0 : available);
        })
        .map(v => String(v.id).match(/(\d+)$/)?.[1] || String(v.id));

      if (!inStockVariantIds.length) {
        console.log('ℹ️ products/update: no variants are in-stock; nothing to do.');
        return res.status(200).send('ok');
      }

      // Fetch pending alerts for any of these variants for this shop
      const pending = await Alert.find({
        shop,
        variantId: { $in: inStockVariantIds },
        sent: { $ne: true },
      });

      console.log(`🔎 products/update: in-stock variants=${inStockVariantIds.join(', ')}; pending matches=${pending.length}`);

      // Send notifications
      for (const a of pending) {
        const ok = await sendWhatsApp(a.phone, `Good news! Your item is back in stock: https://${shop}/products/${product?.handle || ''}`);
        if (ok) {
          a.sent = true;
          await a.save();
          console.log('✅ Notified & marked sent', { phone: a.phone, variantId: a.variantId });
        } else {
          console.warn('⚠️ Failed to send WhatsApp', { phone: a.phone, variantId: a.variantId });
        }
      }

      return res.status(200).send('ok');
    }

    // Optional: inventory_levels/update support (works only if your alerts have inventory_item_id saved)
    if (topic === 'inventory_levels/update') {
      const level = req.body;
      const available = Number(level?.available ?? 0);
      const inventory_item_id = String(level?.inventory_item_id || '');

      console.log('📦 inventory_levels/update parsed:', { inventory_item_id, available });

      if (!inventory_item_id || available <= 0) {
        console.log('ℹ️ inventory level not positive/unknown; skip notifications.');
        return res.status(200).send('ok');
      }

      const pending = await Alert.find({
        shop,
        inventory_item_id,
        sent: { $ne: true },
      });

      console.log(`🔎 inventory_levels/update: pending for ${inventory_item_id} = ${pending.length}`);

      // We don't have product handle here; send a generic message
      for (const a of pending) {
        const ok = await sendWhatsApp(a.phone, `Good news! An item you wanted is back in stock: https://${shop}`);
        if (ok) {
          a.sent = true;
          await a.save();
          console.log('✅ Notified & marked sent', { phone: a.phone, inventory_item_id });
        } else {
          console.warn('⚠️ Failed to send WhatsApp', { phone: a.phone, inventory_item_id });
        }
      }

      return res.status(200).send('ok');
    }

    // Unknown topic
    console.log('ℹ️ Unhandled topic:', topic);
    res.status(200).send('ok');
  } catch (err) {
    console.error('❌ webhook error:', err);
    res.status(200).send('ok'); // respond 200 so Shopify doesn’t retry forever
  }
});

module.exports = router;
