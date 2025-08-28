// utils/registerWebhooks.js
const axios = require("axios");

const API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-04";

function admin(shop, accessToken) {
  return axios.create({
    baseURL: `https://${shop}/admin/api/${API_VERSION}/`,
    headers: { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" },
  });
}

async function ensureWebhook(shop, accessToken, topic, address) {
  const client = admin(shop, accessToken);

  // List
  const { data } = await client.get("webhooks.json");
  const hooks = data?.webhooks || [];

  // Already exists?
  const match = hooks.find(h => h.topic === topic && h.address === address);
  if (match) return { created: false, id: match.id, topic, address };

  // Create
  const res = await client.post("webhooks.json", {
    webhook: { topic, address, format: "json" },
  });
  return { created: true, id: res.data?.webhook?.id, topic, address };
}

async function registerWebhooks(shop, accessToken, host) {
  const base = String(host || "").replace(/\/$/, "");
  const results = [];

  // Inventory restock notifications
  results.push(await ensureWebhook(shop, accessToken, "inventory_levels/update", `${base}/webhooks/inventory`));

  // App uninstall cleanup
  results.push(await ensureWebhook(shop, accessToken, "app/uninstalled", `${base}/uninstall`));

  return results;
}

module.exports = { registerWebhooks };
