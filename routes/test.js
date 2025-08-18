// routes/test.js
const express = require('express');
const router = express.Router();
const sendWhatsApp = require('../utils/sendWhatsApp');

/**
 * GET /test/whatsapp?to=+1XXXXXXXXXX&msg=Hello
 * Returns detailed JSON so you can see WHY it failed (env, sandbox, etc.)
 */
router.get('/whatsapp', async (req, res) => {
  try {
    const to = (req.query.to || '').trim();
    const msg = (req.query.msg || 'Ping from Back-in-Stock app').trim();

    if (!to) return res.status(400).json({ ok: false, error: 'Missing ?to=+1XXXXXXXXXX' });

    const result = await sendWhatsApp(to, msg);
    const status = result.ok ? 200 : 500;
    return res.status(status).json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

/**
 * GET /test/twilio/env
 * Safe env diagnostics (does NOT leak secrets).
 */
router.get('/twilio/env', (_req, res) => {
  const sid = (process.env.TWILIO_ACCOUNT_SID || '').trim();
  const tok = (process.env.TWILIO_AUTH_TOKEN  || '').trim();
  const from = (process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_WHATSAPP_FROM || '').trim();

  res.json({
    ok: !!(sid && tok && from),
    TWILIO_ACCOUNT_SID_len: sid.length,
    TWILIO_AUTH_TOKEN_len: tok.length,
    TWILIO_FROM_present: !!from,
    TWILIO_FROM_value_hint: from.startsWith('whatsapp:') ? 'whatsapp:+...' : (from ? '+E.164 (missing whatsapp:)' : 'missing'),
  });
});

module.exports = router;
