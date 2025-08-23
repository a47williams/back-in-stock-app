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

// === Step 1: Begin OAuth install ===
router.get('/', (req, res) => {
  const { shop } = req.query;

  if (!shop) {
    return res.status(400).send('Missing shop parameter');
  }

  const redirectUri = `${HOST}/auth/callback`;
  const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${SHOPIFY_API_KEY}&scope=${SCOPES}&redirect_uri=${redirectUri}`;

  res.redirect(installUrl);
});

// === Step 2: OAuth callback handler ===
router.get('/callback', async (req, res) => {
  const { hmac, ...params } = req.query;

  if (!params.shop || !params.code) {
    return res.status(400).send('Required parameters missing');
  }

  // ✅ Correct HMAC validation
  const message = Object.keys(params)
    .filter(key => key !== 'signature')
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join('&');

  const providedHmac = Buffer.from(hmac, 'utf-8');
  const generatedHmac = Buffer.from(
    crypto.createHmac('sha256', SHOPIFY_API_SECRET).update(message).digest('hex'),
    'utf-8'
  );

  let isValid = false;
  try {
    isValid = crypto.timingSafeEqual(providedHmac, generatedHmac);
  } catch (e) {
    return res.status(400).send('HMAC validation error');
  }

  if (!isValid) {
    console.error("🔐 HMAC mismatch:\nExpected:", generatedHmac.toString(), "\nGot:", hmac);
    return res.status(400).send('HMAC validation failed');
  }

  // ✅ Exchange code for access token
  const tokenRequestUrl = `https://${params.shop}/admin/oauth/access_token`;
  const payload = {
    client_id: SHOPIFY_API_KEY,
    client_secret: SHOPIFY_API_SECRET,
    code: params.code,
  };

  try {
    const response = await axios.post(tokenRequestUrl, payload);
    const { access_token } = response.data;

    // ✅ Get shop info
    const shopRes = await axios.get(`https://${params.shop}/admin/api/${API_VERSION}/shop.json`, {
      headers: {
        "X-Shopify-Access-Token": access_token
      }
    });

    const shopInfo = shopRes.data.shop;
    const shopEmail = shopInfo.email;

    // ✅ Save to DB with trial
    const now = new Date();
    const trialEnds = new Date(now);
    trialEnds.setDate(trialEnds.getDate() + 7);

    await Shop.findOneAndUpdate(
      { shop: params.shop },
      {
        shop: params.shop,
        accessToken: access_token,
        email: shopEmail,
        plan: 'starter',
        trialStartDate: now,
        trialEndsAt: trialEnds,
        alertsUsedThisMonth: 0,
        alertLimitReached: false
      },
      { upsert: true, new: true }
    );

    // ✅ Redirect to embedded app settings
    const redirectUrl = `${HOST}/settings?shop=${params.shop}`;
    return res.redirect(redirectUrl);

  } catch (err) {
    console.error('❌ OAuth callback error:', err.response?.data || err.message);
    return res.status(500).send('Error during token exchange or shop info fetch');
  }
});

module.exports = router;
