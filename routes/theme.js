// routes/theme.js

const express = require("express");
const axios = require("axios");
const router = express.Router();

const injectSnippet = require("../utils/injectSnippet");
const { getAccessToken } = require("../utils/shopifyApi");
const { listWidgetScriptTags, cleanupWidgetScriptTags } = require("../utils/scriptTagMaintenance");
const Shop = require("../models/Shop");

const API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-04";
const HOST = (process.env.HOST || "").replace(/\/$/, "");

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
 */
async function removeThemeInjection(shop, accessToken) {
  const client = admin(shop, accessToken);
  const themeId = await getMainThemeId(client);
  const current = await getThemeLiquid(client, themeId);

  const re = new RegExp(
    `<script[^>]*src=["']${HOST.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    )}\\/snippetWidget\\.js(?:\\?[^"']*)?["'][^>]*>\\s*<\\/script>\\s*`,
    "gi"
  );

  const matches = current.match(re) || [];
  if (matches.length === 0) return { removed: 0, themeId };

  const updated = current.replace(re, "");
  await putThemeLiquid(client, themeId, updated);
  return { removed: matches.length, themeId };
}

// ---------- route handlers ----------
async function handleInject(req, res) {
  const shop = (req.query.shop || "").trim();
  if (!shop) return res.status(400).json({ ok: false, error: "Missing shop parameter" });
  if (!isValidShop(shop)) return res.status(400).json({ ok: false, error: "Invalid shop domain" });

  try {
    const accessToken = await getAccessToken(shop);
    const result = await injectSnippet(shop, accessToken); // inject via theme or script_tag fallback
    // persist script tag id if present (handy for uninstall cleanup)
    if (result?.method === "script_tag" && result?.details?.id) {
      await Shop.findOneAndUpdate({ shop }, { scriptTagId: result.details.id }, { upsert: true });
    }
    return res.status(200).json({ ok: true, result });
  } catch (err) {
    console.error("Injection error:", err?.response?.data || err.message || err);
    return res.status(500).json({ ok: false, error: err.message || "Injection failed" });
  }
}

async function handleCleanupTheme(req, res) {
  const shop = (req.query.shop || "").trim();
  if (!shop) return res.status(400).json({ ok: false, error: "Missing shop parameter" });
  if (!isValidShop(shop)) return res.status(400).json({ ok: false, error: "Invalid shop domain" });

  try {
    const accessToken = await getAccessToken(shop);
    const client = admin(shop, accessToken);

    // optional: verify write_themes before attempting cleanup
    try {
      const { data } = await client.get("access_scopes.json");
      const scopes = new Set((data.access_scopes || []).map((s) => s.handle));
      if (!scopes.has("write_themes")) {
        return res
          .status(403)
          .json({ ok: false, error: "Missing write_themes scope. Re-auth the app to grant theme permissions." });
      }
    } catch {
      // continue; Shopify will error if not allowed
    }

    const result = await removeThemeInjection(shop, accessToken);
    return res.status(200).json({ ok: true, result });
  } catch (err) {
    console.error("Cleanup error:", err?.response?.data || err.message || err);
    return res.status(500).json({ ok: false, error: err.message || "Cleanup failed" });
  }
}

async function handleScriptsList(req, res) {
  const shop = (req.query.shop || "").trim();
  if (!shop) return res.status(400).json({ ok: false, error: "Missing shop" });
  if (!isValidShop(shop)) return res.status(400).json({ ok: false, error: "Invalid shop domain" });

  try {
    const accessToken = await getAccessToken(shop);
    const result = await listWidgetScriptTags(shop, accessToken);
    return res.json({ ok: true, result });
  } catch (e) {
    console.error("List scripts error:", e?.response?.data || e.message || e);
    return res.status(500).json({ ok: false, error: e.message || "List failed" });
  }
}

async function handleScriptsCleanup(req, res) {
  const shop = (req.query.shop || "").trim();
  if (!shop) return res.status(400).json({ ok: false, error: "Missing shop" });
  if (!isValidShop(shop)) return res.status(400).json({ ok: false, error: "Invalid shop domain" });

  try {
    const accessToken = await getAccessToken(shop);
    const result = await cleanupWidgetScriptTags(shop, accessToken);
    if (result.kept) {
      await Shop.findOneAndUpdate({ shop }, { scriptTagId: result.kept }, { upsert: true });
    }
    return res.json({ ok: true, result });
  } catch (e) {
    console.error("Cleanup scripts error:", e?.response?.data || e.message || e);
    return res.status(500).json({ ok: false, error: e.message || "Cleanup failed" });
  }
}

// ---------- routes ----------
router.post("/inject", handleInject);             // inject widget (theme or script_tag)
router.post("/cleanup", handleCleanupTheme);      // remove legacy theme.liquid script tag(s)

router.get("/scripts", handleScriptsList);        // list script_tags for this widget src
router.post("/scripts/cleanup", handleScriptsCleanup); // delete duplicate script_tags (keep newest)

router.get("/status", (_req, res) => res.json({ ok: true, host: HOST, apiVersion: API_VERSION }));

module.exports = router;
