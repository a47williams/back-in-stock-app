// routes/theme.js

const express = require("express");
const router = express.Router();
const { injectSnippet } = require("../utils/snippetWidget");
const { getAccessToken } = require("../utils/shopifyApi");
// const ensureHmac = require("../utils/hmac"); // 🔒 Removed for now since hmac.js doesn't exist

// Endpoint to inject widget snippet into theme
router.post("/inject", async (req, res) => {
  const shop = req.query.shop;
  if (!shop) {
    return res.status(400).json({ ok: false, error: "Missing shop parameter" });
  }

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
