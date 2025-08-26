const express = require("express");
const fs = require("fs");
const path = require("path");
const router = express.Router();

const injectSnippet = require("../utils/injectSnippet"); // ✅ Add this
const { getAccessToken } = require("../utils/shopifyApi");

// Optional: Read widget code from file if needed elsewhere
const widgetCode = fs.readFileSync(
  path.join(__dirname, "../public/snippetWidget.js"),
  "utf-8"
);

// === Endpoint to manually inject widget into theme ===
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
