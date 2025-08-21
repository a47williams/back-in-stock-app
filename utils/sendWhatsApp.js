const fetch = require("node-fetch");

const API_KEY = process.env.D360_API_KEY; // Your 360dialog API Key
const PHONE_NUMBER_ID = process.env.D360_PHONE_NUMBER_ID; // Your WhatsApp Business Phone ID
const TEMPLATE_NAME = process.env.WHATSAPP_TEMPLATE_NAME || "back_in_stock_alert";

async function sendWhatsApp(to, message = "", opts = {}) {
  if (!API_KEY || !PHONE_NUMBER_ID) {
    throw new Error("360dialog API key or phone number ID not set.");
  }

  if (!to || !to.startsWith("+")) {
    throw new Error("Phone number must be in international format (e.g., +1234567890)");
  }

  const url = `https://waba.360dialog.io/v1/messages`;
  const headers = {
    "Content-Type": "application/json",
    "D360-API-KEY": API_KEY
  };

  const payload = {
    to,
    type: "template",
    template: {
      namespace: "whatsapp:hsm", // default namespace, or your own
      language: {
        code: "en", // change to your approved template language code
        policy: "deterministic"
      },
      name: TEMPLATE_NAME,
      components: [
        {
          type: "body",
          parameters: (opts.templateData || []).map(val => ({
            type: "text",
            text: val
          }))
        }
      ]
    }
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("❌ 360dialog error:", data);
      throw new Error("360dialog message failed");
    }

    console.log("✅ WhatsApp message sent via 360dialog:", data);
    return data;
  } catch (err) {
    console.error("❌ Failed to send WhatsApp message:", err);
    throw err;
  }
}

module.exports = { sendWhatsApp };
