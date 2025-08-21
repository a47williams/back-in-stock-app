const twilio = require("twilio");

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER;

if (!ACCOUNT_SID || !AUTH_TOKEN || !WHATSAPP_NUMBER) {
  throw new Error("❌ Twilio credentials not set in environment variables.");
}

const client = twilio(ACCOUNT_SID, AUTH_TOKEN);

/**
 * Send a WhatsApp message using Twilio
 * @param {string} to - Recipient number in international format (e.g. +1234567890)
 * @param {string} message - Message text to send
 * @param {object} opts - Optional data
 */
async function sendWhatsApp(to, message = "", opts = {}) {
  if (!to || !to.startsWith("+")) {
    throw new Error("Phone number must be in international format (e.g., +1234567890)");
  }

  try {
    const msg = await client.messages.create({
      from: `whatsapp:${WHATSAPP_NUMBER}`,
      to: `whatsapp:${to}`,
      body: message
    });

    console.log("✅ WhatsApp message sent via Twilio:", msg.sid);
    return msg;
  } catch (err) {
    console.error("❌ Failed to send WhatsApp message via Twilio:", err);
    throw err;
  }
}

module.exports = { sendWhatsApp };
