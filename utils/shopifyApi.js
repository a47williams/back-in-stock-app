// utils/shopifyApi.js
// Utilities for talking to Shopify and processing webhook payloads

const fetch = global.fetch; // Node 18+ / 20+ has global fetch
const Alert = require("../models/Alert");
const Shop = require("../models/Shop");
const sendWhatsApp = require("./sendWhatsApp");

// Helper: get a shop's Admin API access token from DB
async function getShopToken(shopDomain) {
  if (!shopDomain) throw new Error("No shop domain provided");
  const rec = await Shop.findOne({ shop: shopDomain }).lean();
  if (!rec || !rec.accessToken) {
    throw new Error(`No access token on file for shop ${shopDomain}`);
  }
  return rec.accessToken;
}

// ---- Variant → inventory_item_id ------------------------------------------

/**
 * Return the inventory_item_id for a given numeric variantId
 * Uses Shopify REST Admin API to keep things simple.
 */
async function getVariantInventoryId(shop, variantId) {
  const token = await getShopToken(shop);
  const apiVersion = process.env.SHOPIFY_API_VERSION || "2024-07";
  const url = `https://${shop}/admin/api/${apiVersion}/variants/${variantId}.json`;

  const resp = await fetch(url, {
    method: "GET",
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`getVariantInventoryId failed ${resp.status}: ${txt}`);
  }

  const data = await resp.json();
  const inventory_item_id = data?.variant?.inventory_item_id;
  return inventory_item_id ? String(inventory_item_id) : null;
}

// ---- Webhook payload → notifications ---------------------------------------

/**
 * Given a webhook {topic, shop, payload}, extract inventory_item_id and
 * available quantity, then notify pending alerts.
 * Returns { totalNotified }
 */
async function notifyFromWebhookPayload({ topic, shop, payload }) {
  let inventory_item_id = null;
  let available = null;

  // inventory_levels/update payload
  if (topic === "inventory_levels/update") {
    inventory_item_id = payload?.inventory_item_id
      ? String(payload.inventory_item_id)
      : null;
    // Shopify sends either "available" or "available" nested; prefer number
    if (typeof payload?.available === "number") available = payload.available;
  }

  // products/update payload (can contain variants with inventory fields)
  if (!inventory_item_id && topic === "products/update") {
    const variants = Array.isArray(payload?.variants) ? payload.variants : [];
    // pick the first variant that has an inventory_item_id
    for (const v of variants) {
      if (v?.inventory_item_id) {
        inventory_item_id = String(v.inventory_item_id);
        // inventory_quantity may be present here
        if (typeof v.inventory_quantity === "number") {
          available = v.inventory_quantity;
        }
        break;
      }
    }
  }

  if (!inventory_item_id) {
    console.log("ℹ️  No inventory_item_id on payload — nothing to do.");
    return { totalNotified: 0 };
  }

  if (!(typeof available === "number" && available > 0)) {
    console.log(
      `ℹ️  Parsed: inventory_item_id=${inventory_item_id}, available=${available} (<=0) — skip notify.`
    );
    return { totalNotified: 0 };
  }

  // Fetch pending alerts for this item
  const pending = await Alert.find({
    shop,
    inventory_item_id,
    sent: { $ne: true },
  })
    .sort({ createdAt: 1 })
    .limit(100)
    .lean();

  if (!pending.length) {
    console.log(`ℹ️  No pending alert(s) for inventory_item_id=${inventory_item_id}`);
    return { totalNotified: 0 };
  }

  // De-dupe by phone in case of dup records
  const byPhone = new Map();
  for (const a of pending) {
    if (!a.phone) continue;
    if (!byPhone.has(a.phone)) byPhone.set(a.phone, a);
  }

  let totalNotified = 0;
  const storeHost = process.env.HOST || ""; // e.g., your Render host (for fallback links)

  // Send and mark as sent
  for (const [phone, alert] of byPhone.entries()) {
    try {
      const to = phone.startsWith("whatsapp:") ? phone : `whatsapp:${phone}`;
      // build a simple PDP link if we have productId
      // If you want storefront link, you can store it on Alert at subscribe time.
      let link = "";
      if (alert.productId && process.env.STOREFRONT_DOMAIN) {
        // If you set STOREFRONT_DOMAIN in env, link to store
        // e.g. myshop.myshopify.com/products/<handle>?variant=<id> (requires handle; we don't have it here)
        // As a fallback, you might deep-link to admin preview or keep generic.
        link = `https://${process.env.STOREFRONT_DOMAIN}/products/${alert.productId}`;
      } else if (storeHost) {
        link = `https://${storeHost}`;
      }

      const message =
        link && link !== storeHost
          ? `Good news! The item you wanted is back in stock. Tap to view: ${link}`
          : `Good news! The item you wanted is back in stock.`;

      const resp = await sendWhatsApp(to, message);
      totalNotified++;

      // Mark this specific alert as sent
      await Alert.updateOne(
        { _id: alert._id },
        { $set: { sent: true, sentAt: new Date(), twilioSid: resp?.sid || null } }
      ).exec();
    } catch (err) {
      const code = err?.code || "";
      const msg = err?.message || String(err);
      console.error("sendWhatsApp error:", { phone, code, msg });
      // do not throw; keep processing others
    }
  }

  return { totalNotified };
}

module.exports = {
  getVariantInventoryId,
  notifyFromWebhookPayload,
};
