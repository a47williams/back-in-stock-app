// utils/shopifyApi.js
const Shop = require("../models/Shop");
const fetch = (...args) => import("node-fetch").then(({default: f}) => f(...args));

const API_KEY = process.env.SHOPIFY_API_KEY;
const API_SECRET = process.env.SHOPIFY_API_SECRET;
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2023-10";
const HOST = process.env.HOST;

/** Retrieve stored token for a shop */
async function getShopToken(shop) {
  const s = await Shop.findOne({ shop }).lean();
  return s?.accessToken || null;
}

/** Get inventory_item_id for a variant */
async function getVariantInventoryId(shop, variantId) {
  const token = await getShopToken(shop);
  if (!token) return null;

  const url = `https://${shop}/admin/api/${API_VERSION}/variants/${variantId}.json`;
  const resp = await fetch(url, { headers: { "X-Shopify-Access-Token": token }});
  if (!resp.ok) return null;
  const data = await resp.json();
  return data?.variant?.inventory_item_id || null;
}

/** Begin OAuth: return install URL */
function beginOAuth(shop) {
  const scopes = (process.env.SCOPES || "").split(",").map(s => s.trim()).filter(Boolean).join(",");
  const redirectUri = `${HOST}/auth/callback`;
  const url = `https://${shop}/admin/oauth/authorize?client_id=${API_KEY}&scope=${encodeURIComponent(scopes)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=nonce&grant_options[]=`; // offline
  return url;
}

/** Complete OAuth (very simplified for dev use) */
async function completeOAuth(req) {
  const { shop, code } = req.query;
  const redirectUri = `${HOST}/auth/callback`;

  const tokenUrl = `https://${shop}/admin/oauth/access_token`;
  const resp = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: API_KEY,
      client_secret: API_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!resp.ok) throw new Error("Token exchange failed");
  const data = await resp.json();
  const accessToken = data?.access_token;
  if (!accessToken) throw new Error("No access token");

  return { shop, accessToken };
}

module.exports = { getVariantInventoryId, getShopToken, beginOAuth, completeOAuth };
