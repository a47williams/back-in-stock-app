// utils/scriptTagMaintenance.js
const axios = require("axios");

const API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-04";
const WIDGET_SRC = (process.env.HOST || "").replace(/\/$/, "") + "/snippetWidget.js";

function admin(shop, accessToken) {
  return axios.create({
    baseURL: `https://${shop}/admin/api/${API_VERSION}/`,
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
  });
}

async function listWidgetScriptTags(shop, accessToken) {
  const client = admin(shop, accessToken);
  const { data } = await client.get("script_tags.json");
  const all = data.script_tags || [];
  const normalize = (s) => String(s || "").replace(/\/$/, "");
  const matches = all.filter((st) => normalize(st.src) === normalize(WIDGET_SRC));
  return { all, matches, widgetSrc: WIDGET_SRC };
}

async function cleanupWidgetScriptTags(shop, accessToken) {
  const client = admin(shop, accessToken);
  const { matches } = await listWidgetScriptTags(shop, accessToken);
  if (matches.length <= 1) {
    return { removed: 0, kept: matches[0]?.id || null, found: matches.length };
  }
  // keep the newest (highest id); delete the rest
  const sorted = matches.sort((a, b) => Number(b.id) - Number(a.id));
  const keep = sorted[0];
  const toDelete = sorted.slice(1);
  for (const st of toDelete) {
    await client.delete(`script_tags/${st.id}.json`);
  }
  return { removed: toDelete.length, kept: keep.id, found: matches.length, keptSrc: keep.src };
}

module.exports = { listWidgetScriptTags, cleanupWidgetScriptTags };
