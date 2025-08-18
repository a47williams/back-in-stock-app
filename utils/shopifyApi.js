// utils/shopifyApi.js
const axios = require('axios');
const Shop = require('../models/Shop');

function normalizeId(id) {
  if (!id) return null;
  const s = String(id);
  const m = s.match(/(\d+)$/);
  return m ? m[1] : s;
}

async function getShopToken(shop) {
  if (!shop && process.env.SHOPIFY_SHOP) {
    shop = process.env.SHOPIFY_SHOP;
  }

  if (shop) {
    const rec = await Shop.findOne({ shop }).lean();
    if (rec?.accessToken) return rec.accessToken;
  }

  if (process.env.SHOPIFY_ADMIN_TOKEN && process.env.SHOPIFY_SHOP) {
    if (!shop) shop = process.env.SHOPIFY_SHOP;
    return process.env.SHOPIFY_ADMIN_TOKEN;
  }

  throw new Error(`No access token on file for shop ${shop || '(none)'}`);
}

async function getVariantInventoryId(shop, variantId) {
  const accessToken = await getShopToken(shop);
  const vId = normalizeId(variantId);

  const url = `https://${shop}/admin/api/2023-10/variants/${vId}.json`;
  const resp = await axios.get(url, {
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
  });

  const invId = resp?.data?.variant?.inventory_item_id;
  return invId ? String(invId) : null;
}

module.exports = { getVariantInventoryId };
