// routes/theme.js
const express = require("express");
const router = express.Router();

const injectSnippet = require("../utils/injectSnippet");
const { getAccessToken } = require("../utils/shopifyApi");
const Shop = require("../models/Shop"); // ✅ add this

function isValidShop(shop) {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop);
}

async function handleInject(req, res) {
  const shop = (req.query.shop || "").trim();
  if (!shop) return res.status(400).json({ ok: false, error: "Missing shop parameter" });
  if (!isValidShop(shop)) return res.status(400).json({ ok: false, error: "Invalid shop domain" });

  try {
    const accessToken = await getAccessToken(shop);
    const result = await injectSnippet(shop, accessToken);

    // ✅ persist script tag id for later cleanup
    if (result?.method === "script_tag" && result?.details?.id) {
      await Shop.findOneAndUpdate(
        { shop },
        { scriptTagId: result.details.id },
        { upsert: true }
      );
    }

    return res.status(200).json({ ok: true, result });
  } catch (err) {
    console.error("Injection error:", err?.response?.data || err.message || err);
    return res.status(500).json({ ok: false, error: err.message || "Injection failed" });
  }
}

router.post("/inject", handleInject);
if (process.env.ALLOW_THEME_INJECT_GET === "1") router.get("/inject", handleInject);
router.get("/status", (_req, res) => res.json({ ok: true }));
module.exports = router;
