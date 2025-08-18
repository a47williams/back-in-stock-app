// utils/sendWhatsApp.js
const twilio = require('twilio');

/**
 * Send a WhatsApp (or SMS) message using Twilio.
 * Env required:
 *  - TWILIO_ACCOUNT_SID
 *  - TWILIO_AUTH_TOKEN
 *  - TWILIO_PHONE_NUMBER  (e.g. "whatsapp:+14155238886" OR "+14155238886")
 *
 * @param {string} to E.164 number, with or without "whatsapp:" prefix (e.g. "+16035551234" or "whatsapp:+16035551234")
 * @param {string} body Message text
 * @returns {Promise<{ ok: boolean, sid?: string, code?: string, error?: string }>}
 */
module.exports = async function sendWhatsApp(to, body) {
  const accountSid = (process.env.TWILIO_ACCOUNT_SID || '').trim();
  const authToken  = (process.env.TWILIO_AUTH_TOKEN  || '').trim();
  const fromRaw    = (process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_WHATSAPP_FROM || '').trim();

  if (!accountSid || !authToken || !fromRaw) {
    const missing = {
      TWILIO_ACCOUNT_SID: !!accountSid,
      TWILIO_AUTH_TOKEN: !!authToken,
      TWILIO_PHONE_NUMBER: !!fromRaw
    };
    const error = `Missing Twilio env vars: ${Object.entries(missing).filter(([,v])=>!v).map(([k])=>k).join(', ')}`;
    console.error('sendWhatsApp env error:', error);
    return { ok: false, error };
  }

  const client = twilio(accountSid, authToken);

  const from = fromRaw.startsWith('whatsapp:') ? fromRaw : `whatsapp:${fromRaw}`;
  const toNum = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

  try {
    const msg = await client.messages.create({
      from,
      to: toNum,
      body
    });
    return { ok: true, sid: msg.sid };
  } catch (e) {
    const code = e.code || e.status || e.name || 'TWILIO_ERROR';
    const error = e.message || String(e);
    console.error('sendWhatsApp error:', { code, error });
    return { ok: false, code, error };
  }
};
