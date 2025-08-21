const axios = require("axios");

const D360_API_KEY = process.env.D360_API_KEY;
const PHONE_NUMBER_ID = process.env.D360_PHONE_NUMBER_ID;
const TEMPLATE_NAME = process.env.WHATSAPP_TEMPLATE_NAME;

async function sendWhatsApp360(to, templateData = {}) {
  if (!D360_API_KEY || !PHONE_NUMBER_ID || !TEMPLATE_NAME) {
    throw new Error("360dialog WhatsApp not fully configured.");
  }

  const url = `https://waba.360dialog.io/v1/messages`;
  const payload = {
    to: to.replace("whatsapp:", ""), // 360 requires number only
    type: "template",
    template: {
      namespace: "whatsapp:hsm", // Default namespace
      name: TEMPLATE_NAME,
      language: { code: "en_US" },
      components: [
        {
          type: "body",
          parameters: Object.entries(templateData).map(([key, value]) => ({
            type: "text",
            text: value
          }))
        }
      ]
    }
  };

  const headers = {
    Authorization: `Bearer ${D360_API_KEY}`,
    "Content-Type": "application/json"
  };

  const res = await axios.post(url, payload, { headers });
  return res.data;
}

module.exports = { sendWhatsApp360 };
