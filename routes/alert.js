const express = require("express");
const router = express.Router();

const { dbReady } = require("../db");
const Alert = require("../models/Alert");
const Shop = require("../models/Shop");
const { getVariantInventoryId } = require("../utils/shopifyApi");
const checkPlanLimits = require("../middlewares/checkPlanLimits");

// Helper to make sure DB is connected
async function ensureDbReady() {
  try {
    await dbReady;
  } catch (err) {
    throw new Error("database_unavailable: " + (err?.message || "could not connect"));
  }
}

router.post("/register", express.json(), async (req, res, next) => {
  try {
    const { shop } = req.body || {};
    if (!shop) {
      return res.status(400).json({ ok: false, error: "missing_shop" });
    }

    await ensureDbReady();

    const shopDoc = await Shop.findOne({ shop });
    if (!shopDoc || !shopDoc.accessToken) {
      return res.status(400).json({
        ok: false,
        error: `No access token on file for shop ${shop}`,
      });
    }

    // Attach shopDoc to req for middleware use
    req.shop = shopDoc;

    // Run the plan limiter before continuing
    return checkPlanLimits(req, res, async () => {
      // Plan OK — proceed with registration logic
      const { productId, variantId, phone } = req.body || {};
      console.log("🔍 Incoming alert payload:", req.body);

      if (!variantId || !phone) {
        return res.status(400).json({
          ok: false,
          error: "missing_params",
          details: { variantId: !!variantId, phone: !!phone },
        });
      }

      const inventory_item_id = await getVariantInventoryId(shop, variantId);
      if (!inventory_item_id) {
        return res
          .status(400)
          .json({ ok: false, error: "No inventory_item_id for this variant" });
      }

      const normalizedPhone = phone.startsWith("whatsapp:")
        ? phone
        : `whatsapp:${phone}`;

      await Alert.findOneAndUpdate(
        { shop, inventory_item_id, phone: normalizedPhone },
        {
          shop,
          inventory_item_id,
          phone: normalizedPhone,
          productId,
          variantId,
          sent: false,
          updatedAt: new Date(),
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      console.log("✅ Alert saved", {
        shop,
        variantId,
        inventory_item_id,
        phone: normalizedPhone,
      });

      return res.status(200).json({ ok: true });
    });
  } catch (err) {
    console.error("❌ Error saving alert", err?.stack || err);
    const msg =
      err?.message && err.message.startsWith("database_unavailable")
        ? err.message
        : "internal_error";
    return res.status(500).json({ ok: false, error: msg });
  }
});

module.exports = router;
