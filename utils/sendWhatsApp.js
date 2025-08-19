// utils/sendWhatsApp.js
const twilio = require("twilio");

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
const AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN || "";
const FROM        = process.env.TWILIO_FROM || "whatsapp:+14155238886";

const client = (ACCOUNT_SID && AUTH_TOKEN) ? twilio(ACCOUNT_SID, AUTH_TOKEN) : null;

/**
 * @param {string} to must be 'whatsapp:+15551234567'
 * @param {string} message
 * @param {object} opts  // e.g. ContentSid, ContentVariables
 */
async function sendWhatsApp(to, message = "", opts = {}) {
  if (!client) throw new Error("Twilio client not initialized.");
  if (!to || !to.startsWith("whatsapp:")) throw new Error("Invalid 'to' — must look like whatsapp:+15551234567.");

  const hasBody = typeof message === "string" && message.trim().length > 0;
  const payload = {
    to,
    from: FROM,
    ...(hasBody ? { body: message } : {}),
    ...opts,
  };

  if (!payload.body && !payload.ContentSid && !payload.mediaUrl) {
    payload.body = "Back-in-stock alert from your store.";
  }

  const msg = await client.messages.create(payload);
  return msg;
}

module.exports = { sendWhatsApp };
