// routes/test.js
const express = require("express");
const router = express.Router();
const { getVariantInventoryId } = require("../utils/shopifyApi");

router.get("/debug/variant", async (req, res) => {
  const { shop, variantId } = req.query;
  const inv = await getVariantInventoryId(shop, variantId);
  if (!inv) return res.status(404).json({ ok: false, error: "inventory_item_id not found" });
  return res.json({ ok: true, shop, variantId, inventory_item_id: inv });
});

module.exports = router;
