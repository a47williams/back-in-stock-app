// routes/auth.js
const express = require("express");
const crypto = require("crypto");
const axios = require("axios");
const Shop = require("../models/Shop");

const router = express.Router();

/* ===== env ===== */
const {
  SHOPIFY_API_KEY,
  SHOPIFY_API_SECRET,
  HOST, // e.g. https://back-in-stock-app.onrender.com
  SCOPES = "read_products,read_inventory,write_inventory",
  HMAC_MODE = "lenient",   // "strict" | "lenient"
  SKIP_HMAC = "false",     // "true" | "false"
} = process.env;

const isTrue = (v) => String(v).toLowerCase() === "true";

/* ===== helpers ===== */
function buildInstallUrl(shop, state) {
  const redirectUri = `${HOST.replace(/\/$/, "")}/auth/callback`;
  const scope = SCOPES.split(/\s*,\s*/).join(",");
  return (
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${encodeURIComponent(SHOPIFY_API_KEY)}` +
    `&scope=${encodeURIComponent(scope)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}&grant_options[]=per-user`
  );
}

function verifyHmacFromQuery(query) {
  const { hmac, signature, ...rest } = query;
  const message = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${Array.isArray(rest[k]) ? rest[k].join(",") : rest[k]}`)
    .join("&");

  const digest = crypto
    .createHmac("sha256", SHOPIFY_API_SECRET)
    .update(message)
    .digest("hex");

  return crypto.timingSafeEqual(Buffer.from(digest, "utf8"), Buffer.from(hmac, "utf8"));
}

async function exchangeCodeForToken(shop, code) {
  const url = `https://${shop}/admin/oauth/access_token`;
  const { data } = await axios.post(url, {
    client_id: SHOPIFY_API_KEY,
    client_secret: SHOPIFY_API_SECRET,
    code,
  });
  return data; // { access_token, scope, ... }
}

/* ===== routes ===== */

// start: /auth?shop=your-store.myshopify.com
router.get("/", async (req, res) => {
  try {
    const shop = String(req.query.shop || "").trim();
    if (!shop || !shop.endsWith(".myshopify.com")) {
      return res.status(400).send("Missing or invalid ?shop= parameter.");
    }

    const state = crypto.randomBytes(16).toString("hex");
    req.session.shopifyState = state;
    req.session.shop = shop;

    const installUrl = buildInstallUrl(shop, state);
    return res.redirect(installUrl);
  } catch (err) {
    console.error("❌ /auth error", err);
    return res.status(500).send("Auth start error.");
  }
});

// callback: /auth/callback?shop=...&code=...&state=...&hmac=...
router.get("/callback", async (req, res) => {
  const { shop, code, state } = req.query || {};
  try {
    if (!shop || !code || !state) {
      return res.status(400).send("Auth callback error: missing params.");
    }

    // state check
    if (!req.session.shopifyState || state !== req.session.shopifyState) {
      console.error("❌ State mismatch", {
        expected: req.session.shopifyState,
        got: state,
      });
      return res.status(400).send("Auth callback error: invalid state.");
    }

    // HMAC check
    let hmacOk = false;
    try {
      hmacOk = verifyHmacFromQuery(req.query);
    } catch (_) {
      hmacOk = false;
    }

    const skip = isTrue(SKIP_HMAC);
    const strict = String(HMAC_MODE).toLowerCase() === "strict";

    if (!hmacOk) {
      if (skip) {
        console.warn("⚠️ HMAC invalid, SKIP_HMAC=true – continuing.");
      } else if (strict) {
        console.error("❌ HMAC invalid (strict).");
        return res.status(400).send("Auth callback error: invalid HMAC.");
      } else {
        console.warn("⚠️ HMAC invalid (lenient) – continuing.");
      }
    }

    // token
    const tokenResp = await exchangeCodeForToken(shop, code);
    const accessToken = tokenResp.access_token;
    if (!accessToken) {
      console.error("❌ No access_token", tokenResp);
      return res.status(400).send("Auth callback error: missing access token.");
    }

    await Shop.findOneAndUpdate(
      { shop },
      { shop, accessToken, scopes: tokenResp.scope || "" },
      { upsert: true, new: true }
    );

    console.log("✅ Saved access token for", shop);

    delete req.session.shopifyState;

    // back to Shopify admin app
    return res.redirect(`https://${shop}/admin/apps/back-in-stock-alerts`);
  } catch (err) {
    console.error("❌ /auth/callback error", err?.response?.data || err);
    return res.status(500).send("Auth callback error");
  }
});

// debug: /auth/token/check?shop=...
router.get("/token/check", async (req, res) => {
  try {
    const { shop } = req.query;
    if (!shop) return res.status(400).json({ ok: false, error: "Missing ?shop" });
    const doc = await Shop.findOne({ shop }, { accessToken: 0 });
    return res.json({ ok: true, found: !!doc, shop: doc?.shop || null, scopes: doc?.scopes || "" });
  } catch (err) {
    console.error("❌ token check error", err);
    return res.status(500).json({ ok: false, error: "server" });
  }
});

module.exports = router;
