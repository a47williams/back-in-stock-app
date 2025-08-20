// utils/shopifyApi.js
const axios = require("axios");
const Shop = require("../models/Shop");

async function getVariantInventoryId(shop, variantId) {
  const shopDoc = await Shop.findOne({ shop });
  if (!shopDoc || !shopDoc.accessToken) {
    throw new Error("No access token found for shop");
  }

  const url = `https://${shop}/admin/api/2023-10/variants/${variantId}.json`;

  const response = await axios.get(url, {
    headers: {
      "X-Shopify-Access-Token": shopDoc.accessToken,
      "Content-Type": "application/json",
    },
  });

  return response.data?.variant?.inventory_item_id || null;
}

module.exports = {
  getVariantInventoryId,
};
