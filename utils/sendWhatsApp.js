// utils/sendWhatsApp.js
const twilio = require("twilio");

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const FROM = process.env.TWILIO_FROM; "whatsapp:+16037165050"
const TEMPLATE_SID = process.env.WHATSAPP_TEMPLATE_SID || ""; // New template variable

const client = (ACCOUNT_SID && AUTH_TOKEN) ? twilio(ACCOUNT_SID, AUTH_TOKEN) : null;

async function sendWhatsApp(to, message = "", opts = {}) {
  if (!client) throw new Error("Twilio not initialized.");
  if (!to || !to.startsWith("whatsapp:")) throw new Error("`to` must start with whatsapp:");

  const payload = { from: FROM, to, ...opts };

  // Use template if provided
  if (opts.useTemplate && TEMPLATE_SID) {
    payload.contentSid = TEMPLATE_SID;
    payload.contentVariables = JSON.stringify(opts.templateData || {});
  } else if (message.trim()) {
    payload.body = message;
  } else {
    payload.body = "Back-in-stock alert!";
  }

  return await client.messages.create(payload);
}

module.exports = { sendWhatsApp };
