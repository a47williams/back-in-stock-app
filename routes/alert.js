// routes/alert.js
const express = require('express');
const router = express.Router();
const Alert = require('../models/Alert');

// normalize numeric id from gid or number
function normalizeId(id) {
  if (!id) return null;
  const s = String(id);
  const m = s.match(/(\d+)$/);
  return m ? m[1] : s;
}

// Simple health for this router (reachable at /alerts/healthz)
router.get('/healthz', (_req, res) => res.json({ ok: true, scope: 'alerts' }));

// POST /alerts/register
router.post('/register', express.json(), async (req, res) => {
  try {
    let shop =
      (req.body && req.body.shop) ||
      req.get('X-Shopify-Shop-Domain') ||
      process.env.SHOPIFY_SHOP || null;

    const productId = normalizeId(req.body?.productId);
    const variantId = normalizeId(req.body?.variantId);
    const phone     = (req.body?.phone || '').trim();

    if (!shop || !variantId || !phone) {
      console.error('register missing fields:', { shop, variantId, phone });
      return res.status(400).json({ error: 'Missing shop, variantId or phone' });
    }

    await Alert.findOneAndUpdate(
      { shop, variantId, phone },
      { shop, productId, variantId, phone, sent: false },
      { upsert: true, new: true }
    );

    console.log('✅ Alert saved', { shop, variantId, phone });
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Error saving alert', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /alerts/debug/list
router.get('/debug/list', async (_req, res) => {
  try {
    const docs = await Alert.find().lean();
    res.json(docs.map(d => ({
      shop: d.shop,
      productId: d.productId,
      variantId: d.variantId,
      inventory_item_id: d.inventory_item_id,
      phone: d.phone,
      sent: d.sent,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
