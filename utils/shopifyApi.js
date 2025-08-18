// utils/shopifyApi.js
const axios = require('axios');
const Shop = require('../models/Shop');

/**
 * Get a shop's Admin API access token from DB.
 * Your auth flow should save { shop, accessToken } in Shop collection.
 */
async function getShopToken(shop) {
  const rec = await Shop.findOne({ shop }).lean();
  if (!rec || !rec.accessToken) {
    throw new Error(`No access token on file for shop ${shop}`);
  }
  return rec.accessToken;
}

/**
 * Fetch variant -> inventory_item_id using Admin REST
 * GET /admin/api/2023-10/variants/{variantId}.json
 */
async function getVariantInventoryId(shop, variantId) {
  const accessToken = await getShopToken(shop);

  const url = `https://${shop}/admin/api/2023-10/variants/${variantId}.json`;
  const resp = await axios.get(url, {
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
  });

  const invId = resp?.data?.variant?.inventory_item_id;
  return invId ? String(invId) : null;
}

module.exports = {
  getVariantInventoryId,
};
