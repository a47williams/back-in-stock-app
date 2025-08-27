// routes/theme.js

const express = require("express");
const axios = require("axios");
const router = express.Router();

const injectSnippet = require("../utils/injectSnippet");
const { getAccessToken } = require("../utils/shopifyApi");

const API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-04";
const HOST = process.env.HOST || "";

// ---------- helpers ----------
function isValidShop(shop) {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop);
}

function admin(shop, accessToken) {
  return axios.create({
    baseURL: `https://${shop}/admin/api/${API_VERSION}/`,
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
  });
}

async function getMainThemeId(client) {
  const { data } = await client.get("themes.json");
  const main = (data.themes || []).find((t) => t.role === "main");
  if (!main) throw new Error("No main theme found");
  return main.id;
}

async function getThemeLiquid(client, themeId) {
  const { data } = await client.get(`themes/${themeId}/assets.json`, {
    params: { "asset[key]": "layout/theme.liquid" },
  });
  return data.asset?.value || "";
}

async function putThemeLiquid(client, themeId, value) {
  await client.put(`themes/${themeId}/assets.json`, {
    asset: { key: "layout/theme.liquid", value },
  });
}

/**
 * Remove any <script ... src=".../snippetWidget.js"...></script> from theme.liquid
 * Handles single/double quotes, extra attrs, and trailing whitespace.
 */
async function removeThemeInjection(shop, accessToken) {
  const client = admin(shop, accessToken);
  const themeId = await getMainThemeId(client);
  const current = await getThemeLiquid(client, themeId);

  // Match any script tag whose src ends with snippetWidget.js (optionally with query string)
  const re = new RegExp(
    `<script[^>]*src=["'][^"']*snippetWidget\\.js(?:\\?[^"']*)?["'][^>]*>\\s*</script>\\s*`,
    "gi"
  );

  const matches = current.match(re) || [];
  if (matches.length === 0) {
    return { removed: 0, themeId };
  }

  const updated = current.replace(re, "");
  await putThemeLiquid(client, themeId, updated);
  return { removed: matches.length, themeId };
}

// ---------- routes ----------

// Inject (theme or ScriptTag fallback handled inside injectSnippet)
router.post("/inject", async (req, res) => {
  const shop = (req.query.shop || "").trim();
  if (!shop) return res.status(400).json({ ok: false, error: "Missing shop parameter" });
  if (!isValidShop(shop)) return res.status(400).json({ ok: false, error: "Invalid shop domain" });

  try {
    const accessToken = await getAccessToken(shop);
    const result = await injectSnippet(shop, accessToken);
    return res.status(200).json({ ok: true, result });
  } catch (err) {
    console.error("Injection error:", err?.response?.data || err.message || err);
    return res.status(500).json({ ok: false, error: err.message || "Injection failed" });
  }
});

// Cleanup legacy theme.liquid injection
router.post("/cleanup", async (req, res) => {
  const shop = (req.query.shop || "").trim();
  if (!shop) return res.status(400).json({ ok: false, error: "Missing shop parameter" });
  if (!isValidShop(shop)) return res.status(400).json({ ok: false, error: "Invalid shop domain" });

  try {
    const accessToken = await getAccessToken(shop);
    const client = admin(shop, accessToken);

    // Optional: check scopes and fail fast if no write_themes
    try {
      const { data } = await client.get("access_scopes.json");
      const scopes = new Set((data.access_scopes || []).map((s) => s.handle));
      if (!scopes.has("write_themes")) {
        return res.status(403).json({
          ok: false,
          error: "Missing write_themes scope. Re-auth the app to grant theme permissions.",
        });
      }
    } catch {
      // If scope check fails, continue; Shopify will error if not allowed.
    }

    const result = await removeThemeInjection(shop, accessToken);
    return res.status(200).json({ ok: true, result });
  } catch (err) {
    console.error("Cleanup error:", err?.response?.data || err.message || err);
    return res.status(500).json({ ok: false, error: err.message || "Cleanup failed" });
  }
});

// Optional status
router.get("/status", (_req, res) => res.json({ ok: true, host: HOST, apiVersion: API_VERSION }));

module.exports = router;
