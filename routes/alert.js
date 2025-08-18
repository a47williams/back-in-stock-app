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
// GET /alerts/debug/clear (DANGER: wipes all alerts)
router.get('/debug/clear', async (_req, res) => {
  const r = await Alert.deleteMany({});
  res.json({ ok: true, deleted: r.deletedCount });
});
// --- TEMP DEBUG ROUTES ---
// List all alerts
router.get('/debug/list', async (_req, res) => {
  const all = await Alert.find({}).sort({ createdAt: -1 }).lean();
  res.json(all);
});

// Clear all alerts (DANGER in production)
router.delete('/debug/clear', async (_req, res) => {
  const { deletedCount } = await Alert.deleteMany({});
  res.json({ ok: true, deletedCount });
});

// Seed a pending alert for a known inventory_item_id
router.post('/debug/seed', express.json(), async (req, res) => {
  try {
    const { shop, inventory_item_id, variantId, phone } = req.body;
    if (!shop || !inventory_item_id || !phone) {
      return res.status(400).json({ ok: false, error: 'shop, inventory_item_id, phone required' });
    }
    const doc = await Alert.findOneAndUpdate(
      { shop, inventory_item_id, phone },
      { shop, inventory_item_id, variantId: variantId || null, phone, sent: false },
      { upsert: true, new: true }
    );
    res.json({ ok: true, doc });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});
// --- END TEMP DEBUG ---

module.exports = router;
