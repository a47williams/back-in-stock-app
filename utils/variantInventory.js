// utils/variantInventory.js
// For MVP we resolve inventory_item_id by calling Admin API using your app token.
// If you already had this implemented elsewhere, keep yours and adjust imports.

const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));

async function getVariantInventoryId(shop, variantId) {
  const adminToken = process.env.SHOPIFY_ADMIN_TOKEN; // or however you store a token per shop
  if (!adminToken) return null;

  const url = `https://${shop}/admin/api/2025-07/variants/${variantId}.json`;

  const r = await fetch(url, {
    method: "GET",
    headers: {
      "X-Shopify-Access-Token": adminToken,
      "Content-Type": "application/json",
    },
  });

  if (!r.ok) return null;
  const data = await r.json();
  return data?.variant?.inventory_item_id || null;
}

module.exports = { getVariantInventoryId };
