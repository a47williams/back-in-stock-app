// routes/webhook.js
const express = require("express");
const router = express.Router();

const Alert = require("../models/Alert");

// NOTE: This route expects the raw JSON body from Shopify.
// If you enabled HMAC verification elsewhere, keep it there.
// This handler only reads req.headers and req.body and never creates new Alerts.

router.post("/inventory", async (req, res) => {
  try {
    const topic = (req.headers["x-shopify-topic"] || "").toString();
    const shop = (req.headers["x-shopify-shop-domain"] || "").toString();

    const hmacPresent = !!req.headers["x-shopify-hmac-sha256"];
    const len = typeof req.body === "string"
      ? req.body.length
      : Buffer.isBuffer(req.body)
      ? req.body.length
      : JSON.stringify(req.body || {}).length;

    console.log("🪝 /webhook/inventory received {");
    console.log("  topic:", JSON.stringify(topic) + ",");
    console.log("  shop:", JSON.stringify(shop) + ",");
    console.log("  hmacPresent:", hmacPresent + ",");
    console.log("  length:", JSON.stringify(String(len)));
    console.log("}");

    // Body may be Buffer/string if raw parsing is used; normalize to object.
    const payload =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : Buffer.isBuffer(req.body)
        ? JSON.parse(req.body.toString("utf8") || "{}")
        : req.body || {};

    // Collect in-stock variant + inventory_item_id from payload
    const inStockVariantIds = new Set();
    const inStockInventoryItemIds = new Set();

    if (topic === "products/update" && Array.isArray(payload.variants)) {
      for (const v of payload.variants) {
        // inventory_quantity > 0 means in stock
        if (typeof v?.inventory_quantity === "number" && v.inventory_quantity > 0) {
          if (v.id) inStockVariantIds.add(Number(v.id));
          if (v.inventory_item_id) inStockInventoryItemIds.add(Number(v.inventory_item_id));
        }
      }
    }

    // Some shops send only inventory levels; handle that too
    if (topic === "inventory_levels/update") {
      // payload often has: { inventory_item_id, available, ... }
      if (typeof payload?.available === "number" && payload.available > 0 && payload.inventory_item_id) {
        inStockInventoryItemIds.add(Number(payload.inventory_item_id));
      }
    }

    // Log summary
    const inStockSummary =
      inStockInventoryItemIds.size > 0
        ? Array.from(inStockInventoryItemIds).join(",")
        : Array.from(inStockVariantIds).join(",");
    console.log(`📦 products/update: inStock=${inStockSummary || "(none)"} | pending=?`);

    // If we only got variants (without inventory_item_id), try to read inventory_item_id field
    // from the same variants array. (Already done above for products/update.)
    // If after that we still have none, nothing to do.
    if (inStockInventoryItemIds.size === 0 && inStockVariantIds.size === 0) {
      console.log("ℹ️ No in-stock variants detected on payload — nothing to do.");
      return res.status(200).json({ ok: true, processed: 0 });
    }

    // If we have any inventory_item_id, use those as the matching key (preferred).
    // This matches how alerts are saved in /alerts/register.
    let totalNotified = 0;

    if (shop) {
      // Handle by inventory_item_id first
      if (inStockInventoryItemIds.size > 0) {
        for (const invId of inStockInventoryItemIds) {
          const pending = await Alert.find({
            shop,
            inventory_item_id: invId,
            sent: false,
          }).lean();

          console.log(
            `🔎 inventory_item_id=${invId} | found pending=${pending.length}`
          );

          for (const a of pending) {
            try {
              const ok = await require("../utils/sendWhatsApp").sendWhatsApp(
                a.phone,
                // Simple message; your template logic can be used here
                `Good news! Your item is back in stock. Variant ${a.variantId || ""}`
              );

              if (ok) {
                await Alert.updateOne(
                  { _id: a._id },
                  { $set: { sent: true, sentAt: new Date() } }
                );
                totalNotified++;
                console.log(`📲 Notified ${a.phone} (alert ${a._id})`);
              } else {
                console.warn(`⚠️ WhatsApp send returned false for ${a.phone}`);
              }
            } catch (err) {
              console.error("❌ Send/update error:", err.message || err);
            }
          }
        }
      } else {
        // Fallback: match by variantId only (legacy alerts that may not have inventory_item_id)
        for (const variantId of inStockVariantIds) {
          const pending = await Alert.find({
            shop,
            variantId: String(variantId),
            sent: false,
          }).lean();

          console.log(`🔎 variantId=${variantId} | found pending=${pending.length}`);

          for (const a of pending) {
            try {
              const ok = await require("../utils/sendWhatsApp").sendWhatsApp(
                a.phone,
                `Good news! Your item is back in stock. Variant ${a.variantId || ""}`
              );

              if (ok) {
                await Alert.updateOne(
                  { _id: a._id },
                  { $set: { sent: true, sentAt: new Date() } }
                );
                totalNotified++;
                console.log(`📲 Notified ${a.phone} (alert ${a._id})`);
              } else {
                console.warn(`⚠️ WhatsApp send returned false for ${a.phone}`);
              }
            } catch (err) {
              console.error("❌ Send/update error:", err.message || err);
            }
          }
        }
      }
    } else {
      console.warn("⚠️ Missing shop header; cannot match alerts.");
    }

    console.log(`✅ Webhook processed — totalNotified=${totalNotified}`);
    return res.status(200).json({ ok: true, totalNotified });
  } catch (err) {
    console.error("❌ inventory handler error:", err.stack || err);
    return res.status(500).json({ ok: false, error: err.message || "server_error" });
  }
});

module.exports = router;
