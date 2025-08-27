// utils/shopifyApi.js
const axios = require("axios");
const Shop = require("../models/Shop");

const API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-04";

/**
 * Return the saved Admin API access token for a shop.
 * Throws if not found.
 */
async function getAccessToken(shop) {
  if (!shop) throw new Error("Missing shop");
  const doc = await Shop.findOne({ shop }).lean();
  if (!doc || !doc.accessToken) {
    throw new Error(`No access token found for ${shop}`);
  }
  return doc.accessToken;
}

/**
 * Resolve a variant's inventory_item_id from the Admin API.
 * Returns null if not present.
 */
async function getVariantInventoryId(shop, variantId) {
  if (!shop) throw new Error("Missing shop");
  if (!variantId) throw new Error("Missing variantId");

  const accessToken = await getAccessToken(shop);

  const url = `https://${shop}/admin/api/${API_VERSION}/variants/${variantId}.json`;

  try {
    const response = await axios.get(url, {
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
    });

    return response.data?.variant?.inventory_item_id ?? null;
  } catch (err) {
    const detail =
      err.response?.data?.errors ||
      err.response?.data ||
      err.message ||
      "Unknown error";
    throw new Error(`Failed to fetch variant ${variantId}: ${detail}`);
  }
}

module.exports = {
  getAccessToken,
  getVariantInventoryId,
};
