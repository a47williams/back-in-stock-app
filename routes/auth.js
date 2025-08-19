// routes/auth.js
const express = require("express");
const crypto = require("crypto");
const axios = require("axios");
const Shop = require("../models/Shop");

const router = express.Router();

/* =========  ENV  ========= */
const {
  SHOPIFY_API_KEY,
  SHOPIFY_API_SECRET,
  HOST,
  SCOPES = "read_products,write_products,read_inventory,write_inventory",
  HMAC_MODE = "lenient",          // "strict" | "lenient"
  SKIP_HMAC = "false",            // "true"  | "false"
} = process.env;

function bool(x) {
  return String(x).toLowerCase() === "true";
}

/* =========  HELPERS  ========= */

/** Build Shopify install URL */
function buildInstallUrl(shop, state) {
  const redirectUri = `${HOST.replace(/\/$/, "")}/auth/callback`;
  const scope = SCOPES.split(/\s*,\s*/).join(",");
  const url =
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${encodeURIComponent(SHOPIFY_API_KEY)}` +
    `&scope=${encodeURIComponent(scope)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}&grant_options[]=per-user`;
  return url;
}

/** Verify HMAC from Shopify query params */
function verifyHmacFromQuery(query) {
  const { hmac, ...rest } = query;
  const message = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${Array.isArray(rest[k]) ? rest[k].join(",") : rest[k]}`)
    .join("&");

  const digest = crypto
    .createHmac("sha256", SHOPIFY_API_SECRET)
    .update(message)
    .digest("hex");

  return crypto.timingSafeEqual(Buffer.from(digest, "utf-8"), Buffer.from(hmac, "utf-8"));
}

/** Exchange code for access token */
async function exchangeCodeForToken(shop, code) {
  const url = `https://${shop}/admin/oauth/access_token`;
  const { data } = await axios.post(url, {
    client_id: SHOPIFY_API_KEY,
    client_secret: SHOPIFY_API_SECRET,
    code,
  });
  // data: { access_token, scope, ... }
  return data;
}

/* =========  ROUTES  ========= */

/**
 * Start OAuth: /auth?shop={shop-domain}
 */
router.get("/", async (req, res) => {
  try {
    const { shop } = req.query;
    if (!shop || !shop.endsWith(".myshopify.com")) {
      return res.status(400).send("Missing or invalid ?shop= parameter.");
    }

    // CSRF protection via state in session
    const state = crypto.randomBytes(16).toString("hex");
    req.session.shopifyState = state;
    req.session.shop = shop;

    const url = buildInstallUrl(shop, state);
    return res.redirect(url);
  } catch (err) {
    console.error("❌ /auth error:", err);
    return res.status(500).send("Auth start error.");
  }
});

/**
 * OAuth callback: Shopify redirects here
 * /auth/callback?shop=...&code=...&state=...&hmac=...
 */
router.get("/callback", async (req, res) => {
  const { shop, hmac, code, state } = req.query || {};

  try {
    if (!shop || !code || !state || !hmac) {
      return res.status(400).send("Auth callback error: missing parameters.");
    }

    // Validate state
    if (!req.session.shopifyState || state !== req.session.shopifyState) {
      console.error("❌ State mismatch", { expected: req.session.shopifyState, got: state });
      return res.status(400).send("Auth callback error: invalid state.");
    }

    // HMAC verification
    const skipping = bool(SKIP_HMAC);
    const strict = String(HMAC_MODE).toLowerCase() === "strict";
    let hmacOk = false;

    try {
      hmacOk = verifyHmacFromQuery(req.query);
    } catch (e) {
      hmacOk = false;
    }

    if (!hmacOk) {
      if (skipping) {
        console.warn("⚠️ HMAC invalid, but SKIP_HMAC=true – continuing.");
      } else if (!skipping && strict) {
        console.error("❌ HMAC invalid, strict mode – denying.");
        return res.status(400).send("Auth callback error: invalid HMAC.");
      } else {
        console.warn("⚠️ HMAC invalid, lenient mode – continuing.");
      }
    }

    // Exchange code for token
    const tokenResp = await exchangeCodeForToken(shop, code);
    const accessToken = tokenResp.access_token;

    if (!accessToken) {
      console.error("❌ No access_token in response:", tokenResp);
      return res.status(400).send("Auth callback error: missing access token.");
    }

    // Persist token
    const saved = await Shop.findOneAndUpdate(
      { shop },
      { shop, accessToken, scopes: tokenResp.scope || "" },
      { upsert: true, new: true }
    );

    console.log("✅ Saved access token for", shop);

    // Cleanup session
    delete req.session.shopifyState;

    // Redirect back to the Shopify Admin app page (adjust the slug if your app name changes)
    const adminAppPath = `/admin/apps/back-in-stock-alerts`;
    return res.redirect(`https://${shop}${adminAppPath}`);
  } catch (err) {
    console.error("❌ /auth/callback error:", err?.response?.data || err);
    return res.status(500).send("Auth callback error");
  }
});

/**
 * Debug: check if we have a token for a shop (does NOT return token)
 * GET /auth/token/check?shop=your-shop.myshopify.com
 */
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
