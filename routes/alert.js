// routes/alert.js
const express = require("express");
const router = express.Router();

const Alert = require("../models/Alert");
const { getVariantInventoryId } = require("../utils/shopifyApi");

// Helper: normalize shop domain
function normalizeShop(shop) {
  if (!shop) return null;
  return shop.trim().toLowerCase();
}

/**
 * POST /alerts/register
 * Body: { shop, productId, variantId, phone }
 * Saves/updates alert with the resolved inventory_item_id for that variant.
 */
router.post("/register", express.json(), async (req, res) => {
  try {
    const { shop: rawShop, productId, variantId, phone } = req.body || {};
    const shop =
      normalizeShop(rawShop) ||
      normalizeShop(req.headers["x-shop-domain"]) ||
      null;

    if (!shop) {
      console.error("register missing fields:", {
        shop: rawShop || null,
        productId,
        variantId,
        phone,
      });
      return res
        .status(400)
        .json({ ok: false, error: "Missing shop domain on register" });
    }
    if (!productId || !variantId || !phone) {
      console.error("register missing fields:", {
        shop,
        productId,
        variantId,
        phone,
      });
      return res
        .status(400)
        .json({ ok: false, error: "productId, variantId and phone required" });
    }

    // 1) Resolve inventory_item_id for this variant
    const inventory_item_id = await getVariantInventoryId(shop, String(variantId));
    if (!inventory_item_id) {
      console.error("No inventory_item_id for", { shop, variantId });
      return res
        .status(400)
        .json({ ok: false, error: "No inventory_item_id for this variant" });
    }

    // 2) Upsert alert keyed by (shop, inventory_item_id, phone)
    const doc = await Alert.findOneAndUpdate(
      { shop, inventory_item_id, phone },
      {
        $set: {
          shop,
          productId: String(productId),
          variantId: String(variantId),
          inventory_item_id: String(inventory_item_id),
          phone: String(phone),
        },
        $setOnInsert: { sent: false, createdAt: new Date() },
      },
      { upsert: true, new: true }
    );

    console.log("✅ Alert saved", {
      shop,
      productId,
      variantId,
      inventory_item_id,
      phone,
      sent: doc?.sent,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("❌ Error saving alert:", err);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

/**
 * GET /alerts/debug/list
 * Optional query: inventory_item_id, shop
 * Lists alerts so you can confirm saved inventory_item_id matches webhook.
 */
router.get("/debug/list", async (req, res) => {
  try {
    const q = {};
    if (req.query.inventory_item_id) {
      q.inventory_item_id = String(req.query.inventory_item_id);
    }
    if (req.query.shop) {
      q.shop = normalizeShop(req.query.shop);
    }
    const alerts = await Alert.find(q)
      .sort({ createdAt: -1 })
      .lean();
    res.json(alerts);
  } catch (err) {
    console.error("debug/list error:", err);
    res.status(500).json({ ok: false, error: "debug list failed" });
  }
});

/**
 * POST /alerts/debug/clear
 * Body: { inventory_item_id?, shop?, all? }
 * Deletes matching alerts (useful for cleanup during testing).
 */
router.post("/debug/clear", express.json(), async (req, res) => {
  try {
    const { inventory_item_id, shop: rawShop, all } = req.body || {};
    const shop = normalizeShop(rawShop);

    const q = {};
    if (!all) {
      if (inventory_item_id) q.inventory_item_id = String(inventory_item_id);
      if (shop) q.shop = shop;
      if (!q.inventory_item_id && !q.shop) {
        return res.status(400).json({
          ok: false,
          error: "Provide all=true or inventory_item_id and/or shop",
        });
      }
    }

    const result = await Alert.deleteMany(all ? {} : q);
    res.json({ ok: true, deleted: result.deletedCount });
  } catch (err) {
    console.error("debug/clear error:", err);
    res.status(500).json({ ok: false, error: "debug clear failed" });
  }
});

module.exports = router;
