// utils/shopifyApi.js
const axios = require("axios");
const Shop = require("../models/Shop");

const API_VERSION = process.env.SHOPIFY_API_VERSION || "2023-10";

/** Normalize shop domain */
function normalizeShop(shop) {
  if (!shop) return null;
  return shop.trim().toLowerCase();
}

/** Look up a stored access token for a shop set during OAuth install */
async function getShopToken(rawShop) {
  const shop = normalizeShop(rawShop);
  if (!shop) return null;

  const doc = await Shop.findOne({ shop }).lean();
  if (!doc || !doc.accessToken) return null;
  return doc.accessToken;
}

/**
 * Call Shopify REST Admin API
 * Returns { ok, data } — never throws; logs details on failure.
 */
async function shopifyRequest({ shop, token, method = "GET", path, params = {}, data = {} }) {
  try {
    const url = `https://${shop}/admin/api/${API_VERSION}${path}`;
    const res = await axios({
      url,
      method,
      params,
      data,
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
      },
      timeout: 10000,
    });
    return { ok: true, data: res.data };
  } catch (err) {
    const status = err?.response?.status;
    const body = err?.response?.data;
    console.error("shopifyRequest error:", {
      shop,
      path,
      status,
      body,
      msg: err.message,
    });
    return { ok: false, status, error: err.message, body };
  }
}

/**
 * Given a variantId, resolve its inventory_item_id via REST:
 * GET /admin/api/<ver>/variants/{variantId}.json
 * Returns a string inventory_item_id or null; never throws.
 */
async function getVariantInventoryId(rawShop, variantId) {
  const shop = normalizeShop(rawShop);
  if (!shop || !variantId) {
    console.error("getVariantInventoryId: missing shop or variantId", { shop, variantId });
    return null;
  }

  const token = await getShopToken(shop);
  if (!token) {
    console.error("getVariantInventoryId: no access token for shop", { shop });
    return null;
  }

  const resp = await shopifyRequest({
    shop,
    token,
    method: "GET",
    path: `/variants/${String(variantId)}.json`,
  });

  if (!resp.ok) return null;

  const invId = resp?.data?.variant?.inventory_item_id;
  if (!invId) {
    console.error("getVariantInventoryId: inventory_item_id not found on variant", {
      shop,
      variantId,
      payloadKeys: Object.keys(resp?.data || {}),
    });
    return null;
  }

  return String(invId);
}

module.exports = {
  getShopToken,
  shopifyRequest,
  getVariantInventoryId,
};
