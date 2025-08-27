// routes/theme.js

const express = require("express");
const fs = require("fs");
const path = require("path");
const router = express.Router();

const injectSnippet = require("../utils/injectSnippet");
const { getAccessToken } = require("../utils/shopifyApi");

// (Optional) Try to read the widget code at boot. Not required for injection,
// but useful if you reference it elsewhere. Wrapped to avoid crashing on boot.
let widgetCode = "";
try {
  widgetCode = fs.readFileSync(
    path.join(__dirname, "../public/snippetWidget.js"),
    "utf-8"
  );
} catch (e) {
  console.warn(
    "⚠️ Could not read ../public/snippetWidget.js at startup (ok if not needed):",
    e.message
  );
}

// Basic shop domain validation to avoid accidental bad inputs
function isValidShop(shop) {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop);
}

// Shared handler used by POST (and optional GET) routes
async function handleInject(req, res) {
  const shop = (req.query.shop || "").trim();

  if (!shop) {
    return res.status(400).json({ ok: false, error: "Missing shop parameter" });
  }
  if (!isValidShop(shop)) {
    return res.status(400).json({ ok: false, error: "Invalid shop domain" });
  }

  try {
    const accessToken = await getAccessToken(shop);
    const result = await injectSnippet(shop, accessToken);
    return res.status(200).json({ ok: true, result });
  } catch (err) {
    console.error("Injection error:", err?.response?.data || err.message || err);
    return res
      .status(500)
      .json({ ok: false, error: err.message || "Injection failed" });
  }
}

// === Primary endpoint to inject the widget script into the theme (use POST) ===
router.post("/inject", handleInject);

// === Optional: enable GET for quick manual tests by setting an env flag ===
// e.g. ALLOW_THEME_INJECT_GET=1
if (process.env.ALLOW_THEME_INJECT_GET === "1") {
  router.get("/inject", handleInject);
}

// (Optional) simple status check for this router
router.get("/status", (_req, res) => res.json({ ok: true }));

module.exports = router;
