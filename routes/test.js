// routes/test.js
const express = require('express');
const router = express.Router();
const twilio = require('twilio');
const sendWhatsApp = require('../utils/sendWhatsApp');

/**
 * GET /test/whatsapp?to=+1XXXXXXXXXX&msg=Hello
 * Sends a WhatsApp message and returns Twilio's SID.
 */
router.get('/whatsapp', async (req, res) => {
  try {
    const to = (req.query.to || '').trim();
    const msg = (req.query.msg || 'Ping from Back-in-Stock app').trim();
    if (!to) return res.status(400).json({ ok: false, error: 'Missing ?to=+1XXXXXXXXXX' });

    const result = await sendWhatsApp(to, msg);
    return res.status(result.ok ? 200 : 500).json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

/**
 * GET /test/whatsapp/status?sid=SMxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 * Fetch delivery status for a Twilio message SID.
 */
router.get('/whatsapp/status', async (req, res) => {
  try {
    const sid = (req.query.sid || '').trim();
    if (!sid) return res.status(400).json({ ok: false, error: 'Missing ?sid=SM...' });

    const accountSid = (process.env.TWILIO_ACCOUNT_SID || '').trim();
    const authToken  = (process.env.TWILIO_AUTH_TOKEN  || '').trim();
    if (!accountSid || !authToken) {
      return res.status(500).json({ ok: false, error: 'Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN' });
    }

    const client = twilio(accountSid, authToken);
    const msg = await client.messages(sid).fetch();

    return res.json({
      ok: true,
      sid: msg.sid,
      status: msg.status,            // queued | sending | sent | delivered | undelivered | failed
      to: msg.to,
      from: msg.from,
      direction: msg.direction,
      error_code: msg.errorCode || null,
      error_message: msg.errorMessage || null,
      date_created: msg.dateCreated,
      date_sent: msg.dateSent,
      date_updated: msg.dateUpdated
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

/**
 * GET /test/twilio/env
 * Safe env diagnostics (no secrets leaked).
 */
router.get('/twilio/env', (_req, res) => {
  const sid  = (process.env.TWILIO_ACCOUNT_SID || '').trim();
  const tok  = (process.env.TWILIO_AUTH_TOKEN  || '').trim();
  const from = (process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_WHATSAPP_FROM || '').trim();
  res.json({
    ok: !!(sid && tok && from),
    TWILIO_ACCOUNT_SID_len: sid.length,
    TWILIO_AUTH_TOKEN_len: tok.length,
    TWILIO_FROM_present: !!from,
    TWILIO_FROM_value_hint: from
      ? (from.startsWith('whatsapp:') ? 'whatsapp:+...' : '+E.164 (no whatsapp: prefix)')
      : 'missing',
  });
});

module.exports = router;
