// routes/auth.js
const express = require("express");
const crypto = require("crypto");
const axios = require("axios");
const Shop = require("../models/Shop");

const router = express.Router();

/**
 * Build Shopify OAuth URL
 */
function buildInstallUrl({ shop, scopes, host }) {
  const apiKey = process.env.SHOPIFY_API_KEY;
  const redirectUri = new URL("/auth/callback", host).toString();
  const params = new URLSearchParams({
    client_id: apiKey,
    scope: scopes,
    redirect_uri: redirectUri,
    state: crypto.randomBytes(16).toString("hex"),
  });

  // we store state in session to validate CSRF
  return { url: `https://${shop}/admin/oauth/authorize?${params.toString()}`, state: params.get("state") };
}

/**
 * Verify Shopify HMAC (query signature)
 */
function verifyHmac(query) {
  const { hmac, ...rest } = query;
  const message = Object.keys(rest)
    .sort((a, b) => a.localeCompare(b))
    .map((k) => `${k}=${Array.isArray(rest[k]) ? rest[k].join(",") : rest[k]}`)
    .join("&");

  const digest = crypto
    .createHmac("sha256", process.env.SHOPIFY_API_SECRET)
    .update(message)
    .digest("hex");

  return crypto.timingSafeEqual(Buffer.from(digest, "utf-8"), Buffer.from(hmac, "utf-8"));
}

/**
 * GET /auth
 * Starts OAuth install
 * ?shop=your-store.myshopify.com
 */
router.get("/", async (req, res) => {
  try {
    const { shop } = req.query;
    const host = process.env.HOST; // e.g. https://back-in-stock-app.onrender.com
    const scopes = process.env.SCOPES || "read_products,read_inventory,write_customers";

    if (!shop || !shop.endsWith(".myshopify.com")) {
      return res.status(400).send("Missing or invalid ?shop param");
    }
    if (!host) {
      return res.status(500).send("HOST env not set");
    }

    const { url, state } = buildInstallUrl({ shop, scopes, host });
    req.session.oauthState = state;
    req.session.oauthShop = shop;
    return res.redirect(url);
  } catch (err) {
    console.error("❌ /auth error", err);
    return res.status(500).send("Auth error");
  }
});

/**
 * GET /auth/callback
 * Completes OAuth and stores access token
 */
router.get("/callback", async (req, res) => {
  try {
    const { shop, hmac, code, state } = req.query;

    // basic checks
    if (!shop || !hmac || !code || !state) {
      return res.status(400).send("Missing required OAuth params");
    }
    if (state !== req.session.oauthState || shop !== req.session.oauthShop) {
      return res.status(400).send("Invalid state or shop mismatch");
    }
    if (!verifyHmac(req.query)) {
      return res.status(400).send("Invalid HMAC");
    }

    // exchange code for access_token
    const tokenUrl = `https://${shop}/admin/oauth/access_token`;
    const resp = await axios.post(tokenUrl, {
      client_id: process.env.SHOPIFY_API_KEY,
      client_secret: process.env.SHOPIFY_API_SECRET,
      code,
    });

    const accessToken = resp.data && resp.data.access_token;
    if (!accessToken) {
      return res.status(500).send("No access_token returned by Shopify");
    }

    // upsert shop record
    await Shop.findOneAndUpdate(
      { shop },
      { shop, accessToken, installedAt: new Date() },
      { upsert: true, new: true }
    );

    // cleanup session state
    delete req.session.oauthState;
    delete req.session.oauthShop;

    // Success screen
    const host = process.env.HOST;
    return res.send(
      `<html><body style="font-family:system-ui;padding:24px;">
        <h2>🎉 Back In Stock Alerts installed</h2>
        <p>Shop: <b>${shop}</b></p>
        <p>Access token saved. You can close this tab.</p>
        <p><a href="${host}/">Go to app home</a></p>
      </body></html>`
    );
  } catch (err) {
    console.error("❌ /auth/callback error", err?.response?.data || err);
    return res.status(500).send("OAuth callback error");
  }
});

module.exports = router;
