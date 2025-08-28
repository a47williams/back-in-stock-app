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
  if (!shop) throw new Error("Missing shop");
  if (!variantId) throw new Error("Missing variantId");
  const accessToken = await getAccessToken(shop);

  const url = `https://${shop}/admin/api/${API_VERSION}/variants/${variantId}.json`;
  const response = await axios.get(url, {
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
  });

  return response.data?.variant?.inventory_item_id ?? null;
}

async function getVariantProductId(shop, variantId) {
  if (!shop) throw new Error("Missing shop");
  if (!variantId) throw new Error("Missing variantId");
  const accessToken = await getAccessToken(shop);

  const url = `https://${shop}/admin/api/${API_VERSION}/variants/${variantId}.json`;
  const response = await axios.get(url, {
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
  });

  return response.data?.variant?.product_id ?? null;
}

module.exports = {
  getAccessToken,
  getVariantInventoryId,
  getVariantProductId,
};
