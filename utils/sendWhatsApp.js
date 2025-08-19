// utils/sendWhatsApp.js
const twilio = require("twilio");

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
const AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN || "";
const FROM        = process.env.TWILIO_FROM || "whatsapp:+14155238886";

// Create client once
const client = (ACCOUNT_SID && AUTH_TOKEN)
  ? twilio(ACCOUNT_SID, AUTH_TOKEN)
  : null;

/**
 * Send a WhatsApp message via Twilio.
 * @param {string} to - e.g. 'whatsapp:+16037165050'
 * @param {string} message - plain text body (optional if using ContentSid)
 * @param {object} opts - optional Twilio params (ContentSid, ContentVariables, mediaUrl, etc.)
 * @returns {Promise<object>} Twilio message resource
 */
async function sendWhatsApp(to, message = "", opts = {}) {
  if (!client) {
    throw new Error("Twilio client not initialized (check TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN).");
  }
  if (!to || !to.startsWith("whatsapp:")) {
    throw new Error("Invalid 'to' — must start with 'whatsapp:'.");
  }

  // Default body so Twilio is never missing a message
  const hasBody = (typeof message === "string" && message.trim().length > 0);
  const payload = {
    to,
    from: FROM,
    ...(hasBody ? { body: message } : {}),
    ...opts, // allow ContentSid, ContentVariables, mediaUrl, etc.
  };

  // If neither Body nor ContentSid/media provided, force a safe fallback
  if (!payload.body && !payload.ContentSid && !payload.mediaUrl && !payload.mediaUrl) {
    payload.body = "Back-in-stock alert from your store.";
  }

  try {
    const msg = await client.messages.create(payload);
    return msg;
  } catch (err) {
    // Surface useful info in logs
    const code = err && err.code;
    const msg  = (err && (err.message || err.moreInfo)) || String(err);
    console.error("✖ sendWhatsApp error:", { code, error: msg });
    throw err;
  }
}

// Export both ways so requires can't get it wrong
module.exports = sendWhatsApp;
module.exports.sendWhatsApp = sendWhatsApp;
