// utils/sendWhatsApp.js
const twilio = require("twilio");

// Read creds
const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
const AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN  || "";

// Accept either TWILIO_FROM or TWILIO_PHONE_NUMBER from env
const FROM_RAW =
  process.env.TWILIO_FROM ||
  process.env.TWILIO_PHONE_NUMBER ||
  "whatsapp:+14155238886";

// --- helpers ---------------------------------------------------------------

// ensure value starts with "whatsapp:"
function asWhatsApp(addr) {
  if (!addr) return "";
  return addr.startsWith("whatsapp:") ? addr : `whatsapp:${addr}`;
}

// very light E.164 sanity check (optional)
function looksLikePhone(wa) {
  // expects "whatsapp:+<digits>"
  return /^whatsapp:\+\d{7,15}$/.test(wa);
}

// --------------------------------------------------------------------------

// Create client once
const client = ACCOUNT_SID && AUTH_TOKEN ? twilio(ACCOUNT_SID, AUTH_TOKEN) : null;

// Normalize FROM once
const FROM = asWhatsApp(FROM_RAW);

/**
 * Send a WhatsApp message via Twilio.
 * @param {string} to - phone number (with or without "whatsapp:"), e.g. "+16037165050" or "whatsapp:+16037165050"
 * @param {string} message - plain text body (optional if using ContentSid/media)
 * @param {object} opts - extra Twilio params (ContentSid, ContentVariables, mediaUrl, etc.)
 * @returns {Promise<object>} Twilio message resource
 */
async function sendWhatsApp(to, message = "", opts = {}) {
  if (!client) {
    throw new Error(
      "Twilio client not initialized (set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN)."
    );
  }

  // Normalize numbers to Twilio's required schema
  const TO = asWhatsApp(to);
  if (!looksLikePhone(TO)) {
    throw new Error("Invalid 'to' — must look like whatsapp:+15551234567.");
  }

  const FROM_OK = looksLikePhone(FROM)
    ? FROM
    : (() => {
        throw new Error(
          "Invalid 'from' number. Set TWILIO_FROM or TWILIO_PHONE_NUMBER as E.164 (e.g. +14155238886)."
        );
      })();

  // Build payload
  const hasBody = typeof message === "string" && message.trim().length > 0;
  const payload = {
    to: TO,
    from: FROM_OK,
    ...(hasBody ? { body: message } : {}),
    ...opts, // allow ContentSid, ContentVariables, mediaUrl, etc.
  };

  // If neither Body nor ContentSid/media provided, force a safe fallback
  if (!payload.body && !payload.ContentSid && !payload.mediaUrl) {
    payload.body = "📦 Back-in-stock alert from your store.";
  }

  try {
    const msg = await client.messages.create(payload);
    console.log("✅ WhatsApp sent:", msg.sid);
    return msg;
  } catch (err) {
    // Surface useful info in logs (and keep original error for caller)
    const code = err?.code;
    const detail = err?.message || err?.moreInfo || String(err);
    console.error("❌ sendWhatsApp error:", { code, error: detail });
    throw err;
  }
}

// Export both ways so different import styles work
module.exports = sendWhatsApp;
module.exports.sendWhatsApp = sendWhatsApp;
