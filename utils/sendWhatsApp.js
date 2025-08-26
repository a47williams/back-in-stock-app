// utils/sendWhatsApp.js
const twilio = require("twilio");
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

/**
 * Sends a templated WhatsApp message using Twilio's Content API.
 * @param {string} to - The recipient's phone number in international format (e.g., "+15551234567").
 * @param {string} productUrl - URL of the product for dynamic template content.
 */
async function sendWhatsApp(to, productUrl) {
  return client.messages.create({
    from: "whatsapp:+16037165050",  // Your live WhatsApp Business number
    contentSid: process.env.WHATSAPP_TEMPLATE_SID,  // Approved template SID
    contentVariables: JSON.stringify({ 1: productUrl }), // Map variables by position
    to: to.startsWith("whatsapp:") ? to : `whatsapp:${to}`
  });
}

module.exports = { sendWhatsApp };
