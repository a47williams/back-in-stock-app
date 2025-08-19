// routes/test.js
const router = require('express').Router();

router.get('/ping', (_req, res) => res.json({ ok: true, pong: new Date().toISOString() }));

router.get('/health', (_req, res) => res.json({ ok: true, route: 'test/health' }));

try {
  const sendWhatsApp = require('../utils/sendWhatsApp');
  router.get('/whatsapp/send', async (req, res) => {
    const to = req.query.to;
    const msg = req.query.msg || 'Test: Back in stock app ping ✅';
    if (!to) return res.status(400).json({ ok: false, error: 'Provide ?to=+1xxxxxxxxxx' });

    try {
      const sid = await sendWhatsApp(to, msg);
      return res.json({ ok: true, sid });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err?.message || 'Failed to send' });
    }
  });
} catch {
  // utils/sendWhatsApp not present; skip
}

module.exports = router;
