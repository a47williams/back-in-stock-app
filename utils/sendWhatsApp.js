// utils/sendWhatsApp.js
const twilio = require("twilio");

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const FROM_PHONE = process.env.TWILIO_PHONE_NUMBER || "whatsapp:+14155238886"; // Twilio sandbox default

if (!ACCOUNT_SID?.startsWith?.("AC")) {
  console.warn("⚠️ TWILIO_ACCOUNT_SID is missing or invalid. WhatsApp sends will fail.");
}
if (!AUTH_TOKEN) {
  console.warn("⚠️ TWILIO_AUTH_TOKEN is missing. WhatsApp sends will fail.");
}
if (!FROM_PHONE.startsWith("whatsapp:")) {
  console.warn("⚠️ TWILIO_PHONE_NUMBER should be prefixed with 'whatsapp:'. Using sandbox default if needed.");
}

const client = twilio(ACCOUNT_SID, AUTH_TOKEN);

/**
 * Send a WhatsApp message.
 * @param {string} to E.164 phone, with or without 'whatsapp:' prefix
 * @param {object} ctx { shop, productId, variantId, style }
 * @returns {Promise<boolean>}
 */
async function sendWhatsApp(to, ctx = {}) {
  try {
    const shop = ctx.shop || "";
    const variantId = ctx.variantId || "";
    const style = (ctx.style || "friendly").toLowerCase();

    // Build a useful link. Using "add to cart" with variantId is reliable:
    // https://<shop>/cart/<variantId>:1
    const cartUrl =
      shop && variantId
        ? `https://${shop}/cart/${encodeURIComponent(variantId)}:1`
        : "";

    // Simple style presets (MVP)
    let body;
    switch (style) {
      case "formal":
        body = `Good news — the item you requested is back in stock. You can purchase it here: ${cartUrl}`;
        break;
      case "urgent":
        body = `🔥 Back in stock now! Limited quantities available. Grab it before it's gone: ${cartUrl}`;
        break;
      case "friendly":
      default:
        body = `Hey! Your item is back in stock 🙌 Tap to buy: ${cartUrl}`;
        break;
    }

    // Absolute fallback to satisfy Twilio requirement even if ctx was incomplete
    if (!body || body.trim().length === 0) {
      body = "Your requested item is back in stock!";
    }

    const toWhatsApp = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;
    const fromWhatsApp = FROM_PHONE.startsWith("whatsapp:")
      ? FROM_PHONE
      : `whatsapp:${FROM_PHONE}`;

    const msg = await client.messages.create({
      to: toWhatsApp,
      from: fromWhatsApp,
      body,
    });

    console.log("✅ WhatsApp sent", {
      sid: msg.sid,
      to: toWhatsApp,
      status: msg.status,
    });
    return true;
  } catch (err) {
    const code = err?.code;
    const message = err?.message || err?.toString?.() || "unknown error";
    console.error("❌ sendWhatsApp error:", { code, error: message });
    return false;
  }
}

module.exports = sendWhatsApp;
