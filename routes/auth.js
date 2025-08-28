// routes/auth.js
const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const router = express.Router();

const Shop = require("../models/Shop");
const { registerWebhooks } = require("../utils/registerWebhooks");
const injectSnippet = require("../utils/injectSnippet");

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const SCOPES = process.env.SCOPES || "read_products,read_themes,write_themes,write_script_tags";
const HOST = (process.env.HOST || "").replace(/\/$/, "");
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-04";

// helpers
function isValidShop(shop) {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop || "");
}
function timingSafeEq(a, b) {
  try {
    return crypto.timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
  } catch {
    return false;
  }
}

// === Step 1: Begin OAuth install ===
router.get("/", (req, res) => {
  const shop = (req.query.shop || "").trim();
  if (!isValidShop(shop)) return res.status(400).send("Missing or invalid shop");

  const redirectUri = `${HOST}/auth/callback`;
  // simple state for CSRF mitigation (optional: persist and check)
  const state = crypto.randomBytes(12).toString("hex");

  const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${SHOPIFY_API_KEY}` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}`;

  return res.redirect(installUrl);
});

// === Step 2: OAuth callback handler ===
router.get("/callback", async (req, res) => {
  const { hmac, signature, shop, code, state, ...rest } = req.query;

  if (!isValidShop(shop) || !code || !hmac) {
    return res.status(400).send("Required parameters missing");
  }

  // HMAC validation (exclude hmac & signature)
  const message = Object.keys({ shop, code, state, ...rest })
    .filter((k) => k !== "hmac" && k !== "signature")
    .sort()
    .map((k) => `${k}=${req.query[k]}`)
    .join("&");

  const computed = crypto.createHmac("sha256", SHOPIFY_API_SECRET).update(message).digest("hex");
  if (!timingSafeEq(hmac, computed)) {
    console.error("🔐 HMAC mismatch. Expected:", computed, "Got:", hmac);
    return res.status(400).send("HMAC validation failed");
  }

  // Exchange code for access token
  try {
    const tokenRes = await axios.post(`https://${shop}/admin/oauth/access_token`, {
      client_id: SHOPIFY_API_KEY,
      client_secret: SHOPIFY_API_SECRET,
      code,
    });

    const access_token = tokenRes.data?.access_token;
    if (!access_token) throw new Error("No access_token in response");

    // Fetch shop info
    const shopRes = await axios.get(`https://${shop}/admin/api/${API_VERSION}/shop.json`, {
      headers: { "X-Shopify-Access-Token": access_token },
    });
    const shopInfo = shopRes.data?.shop || {};
    const shopEmail = shopInfo.email || null;

    // Upsert shop record
    const now = new Date();
    const trialEnds = new Date(now);
    trialEnds.setDate(trialEnds.getDate() + 7);

    const doc = await Shop.findOneAndUpdate(
      { shop },
      {
        shop,
        accessToken: access_token,
        email: shopEmail,
        installed: true,
        plan: "starter",
        trialStartDate: now,
        trialEndsAt: trialEnds,
        alertsUsedThisMonth: 0,
        alertLimitReached: false,
        updatedAt: now,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Ensure Shopify webhooks are registered
    try {
      const regs = await registerWebhooks(shop, access_token, HOST);
      console.log("✅ Webhooks ensured:", regs);
    } catch (e) {
      console.error("❌ Webhook registration failed:", e?.response?.data || e.message);
    }

    // Optional: auto-inject widget (theme injection preferred if scope allows; falls back to ScriptTag)
    try {
      const result = await injectSnippet(shop, access_token);
      console.log("✅ Widget injection result:", result);
      if (result?.method === "script_tag" && result?.details?.id) {
        await Shop.updateOne({ shop }, { scriptTagId: result.details.id });
      }
    } catch (e) {
      console.error("⚠️ Widget injection failed:", e?.response?.data || e.message);
    }

    // Redirect merchant to app settings (embedded app page)
    const redirectUrl = `${HOST}/settings?shop=${encodeURIComponent(shop)}`;
    return res.redirect(redirectUrl);
  } catch (err) {
    console.error("❌ OAuth callback error:", err?.response?.data || err.message);
    return res.status(500).send("Error during token exchange or shop info fetch");
  }
});

module.exports = router;
