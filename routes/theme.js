// routes/theme.js

const express = require("express");
const router = express.Router();
const { injectSnippet } = require("../utils/snippetWidget");
const { getAccessToken } = require("../utils/shopifyApi");
const ensureHmac = require("../utils/hmac"); // ✅ FIX: Make sure this is included

router.post("/inject", ensureHmac, async (req, res) => {
  const shop = req.query.shop;
  if (!shop) return res.status(400).json({ ok: false, error: "Missing shop parameter" });

  try {
    const accessToken = await getAccessToken(shop);
    const result = await injectSnippet(shop, accessToken);
    return res.json({ ok: true, result });
  } catch (err) {
    console.error("Injection error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
