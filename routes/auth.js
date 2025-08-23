const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const router = express.Router();

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const SCOPES = process.env.SCOPES;
const HOST = process.env.HOST;
const API_VERSION = process.env.SHOPIFY_API_VERSION;

const Shop = require("../models/Shop");

// === Step 1: Begin OAuth flow ===
router.get('/', (req, res) => {
  const { shop } = req.query;

  if (!shop) {
    return res.status(400).send('Missing shop parameter');
  }

  const redirectUri = `${HOST}/auth/callback`;
  const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${SHOPIFY_API_KEY}&scope=${SCOPES}&redirect_uri=${redirectUri}`;

  res.redirect(installUrl);
});

// === Step 2: Handle OAuth callback ===
router.get('/callback', async (req, res) => {
  const { hmac, ...params } = req.query;

  if (!params.shop || !params.code) {
    return res.status(400).send('Required parameters missing');
  }

  // ✅ Step 2a: HMAC validation
  const queryString = Object.keys(params)
    .filter(key => key !== 'signature') // Exclude deprecated 'signature'
    .sort()
    .map(key => `${key}=${encodeURIComponent(params[key])}`)
    .join('&');

  const providedHmac = Buffer.from(hmac, 'utf-8');
  const generatedHash = Buffer.from(
    crypto.createHmac('sha256', SHOPIFY_API_SECRET).update(queryString).digest('hex'),
    'utf-8'
  );

  let isValid = false;
  try {
    isValid =
      providedHmac.length === generatedHash.length &&
      crypto.timingSafeEqual(providedHmac, generatedHash);
  } catch (err) {
    return res.status(400).send('HMAC validation error');
  }

  if (!isValid) {
    return res.status(400).send('HMAC validation failed');
  }

  // ✅ Step 2b: Exchange code for access token
  try {
    const tokenResponse = await axios.post(`https://${params.shop}/admin/oauth/access_token`, {
      client_id: SHOPIFY_API_KEY,
      client_secret: SHOPIFY_API_SECRET,
      code: params.code,
    });

    const accessToken = tokenResponse.data.access_token;

    // ✅ Step 2c: Get store email/info
    const shopData = await axios.get(`https://${params.shop}/admin/api/${API_VERSION}/shop.json`, {
      headers: { 'X-Shopify-Access-Token': accessToken }
    });

    const store = shopData.data.shop;
    const email = store.email;

    // ✅ Step 2d: Save shop info
    const now = new Date();
    const trialEnds = new Date(now);
    trialEnds.setDate(trialEnds.getDate() + 7);

    await Shop.findOneAndUpdate(
      { shop: params.shop },
      {
        shop: params.shop,
        accessToken,
        email,
        plan: 'starter',
        trialStartDate: now,
        trialEndsAt: trialEnds,
        alertsUsedThisMonth: 0,
        alertLimitReached: false
      },
      { upsert: true, new: true }
    );

    // ✅ Step 2e: Redirect to embedded admin app
    res.redirect(`https://${params.shop}/admin/apps/back-in-stock-alerts`);

  } catch (err) {
    console.error('Token exchange error:', err.response?.data || err.message);
    return res.status(500).send('Error during token exchange or shop info fetch');
  }
});

module.exports = router;
