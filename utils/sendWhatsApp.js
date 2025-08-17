// back-in-stock-app/utils/sendWhatsApp.js
let client = null;

function getTwilioClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;

  if (!sid || !token) {
    console.warn('[Twilio] Skipping send — missing SID/TOKEN in .env');
    return null;
  }
  if (!/^AC/.test(sid)) {
    console.warn('[Twilio] Skipping send — SID must start with AC');
    return null;
  }
  if (!client) client = require('twilio')(sid, token);
  return client;
}

async function sendWhatsApp(to, body) {
  const tw = getTwilioClient();
  if (!tw) return false;

  const fromEnv = process.env.TWILIO_PHONE_NUMBER || 'whatsapp:+14155238886'; // sandbox default
  const from = fromEnv.startsWith('whatsapp:') ? fromEnv : `whatsapp:${fromEnv}`;
  const toNum = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

  try {
    const msg = await tw.messages.create({ from, to: toNum, body });
    console.log('✅ WhatsApp sent:', msg.sid, '->', toNum);
    return true;
  } catch (err) {
    console.error('❌ WhatsApp failed:', err?.message || err);
    return false;
  }
}

module.exports = sendWhatsApp;
