// routes/test.js
const express = require('express');
const router = express.Router();
const sendWhatsApp = require('../utils/sendWhatsApp');

/**
 * GET /test/whatsapp?to=+1XXXXXXXXXX&msg=Hello
 * Sends a WhatsApp via your Twilio creds to verify delivery works end-to-end.
 */
router.get('/whatsapp', async (req, res) => {
  try {
    const to = (req.query.to || '').trim();
    const msg = (req.query.msg || 'Ping from Back-in-Stock app').trim();

    if (!to) return res.status(400).json({ error: 'Missing ?to=+1XXXXXXXXXX' });

    const ok = await sendWhatsApp(to, msg);
    return res.json({ ok });
  } catch (err) {
    console.error('test/whatsapp error:', err.message || err);
    return res.status(500).json({ error: 'send_failed', detail: String(err.message || err) });
  }
});

module.exports = router;
