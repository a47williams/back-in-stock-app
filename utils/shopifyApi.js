// utils/shopifyApi.js
const axios = require("axios");
const Shop = require("../models/Shop");

const API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-04";

async function getAccessToken(shop) {
  if (!shop) throw new Error("Missing shop");
  const doc = await Shop.findOne({ shop }).lean();
  if (!doc?.accessToken) throw new Error(`No access token found for ${shop}`);
  return doc.accessToken;
}

async function getVariantInventoryId(shop, variantId) {
  const token = await getAccessToken(shop);
  const url = `https://${shop}/admin/api/${API_VERSION}/variants/${variantId}.json`;
  const { data } = await axios.get(url, {
    headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
  });
  return data?.variant?.inventory_item_id ?? null;
}

async function getVariantProductId(shop, variantId) {
  const token = await getAccessToken(shop);
  const url = `https://${shop}/admin/api/${API_VERSION}/variants/${variantId}.json`;
  const { data } = await axios.get(url, {
    headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
  });
  return data?.variant?.product_id ?? null;
}

module.exports = { getAccessToken, getVariantInventoryId, getVariantProductId };
