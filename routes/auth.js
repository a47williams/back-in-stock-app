const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const querystring = require('querystring');
const router = express.Router();

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const SCOPES = process.env.SCOPES;
const HOST = process.env.HOST;
const API_VERSION = process.env.SHOPIFY_API_VERSION;

const Shop = require("../models/Shop");

router.get('/', (req, res) => {
  const { shop } = req.query;

  if (!shop) {
    return res.status(400).send('Missing shop parameter');
  }

  const redirectUri = `${HOST}/auth/callback`;
  const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${SHOPIFY_API_KEY}&scope=${SCOPES}&redirect_uri=${redirectUri}`;

  res.redirect(installUrl);
});

router.get('/callback', async (req, res) => {
  const { shop, hmac, code, state, ...rest } = req.query;

  if (!shop || !hmac || !code) {
    return res.status(400).send('Required parameters missing');
  }

  // HMAC validation
  const params = { ...rest, shop, code, state };
  const message = querystring.stringify(params);
  const providedHmac = Buffer.from(hmac, 'utf-8');
  const generatedHash = Buffer.from(
    crypto
      .createHmac('sha256', SHOPIFY_API_SECRET)
      .update(message)
      .digest('hex'),
    'utf-8'
  );

  let valid = false;
  try {
    valid =
      providedHmac.length === generatedHash.length &&
      crypto.timingSafeEqual(providedHmac, generatedHash);
  } catch (e) {
    return res.status(400).send('HMAC validation error');
  }

  if (!valid) {
    return res.status(400).send('HMAC validation failed');
  }

  // Exchange code for access token
  const tokenRequestUrl = `https://${shop}/admin/oauth/access_token`;
  const payload = {
    client_id: SHOPIFY_API_KEY,
    client_secret: SHOPIFY_API_SECRET,
    code,
  };

  try {
    const response = await axios.post(tokenRequestUrl, payload);
    const { access_token } = response.data;

    // Fetch store info (for merchant email)
    const shopDataRes = await axios.get(`https://${shop}/admin/api/${API_VERSION}/shop.json`, {
      headers: {
        "X-Shopify-Access-Token": access_token
      }
    });

    const storeInfo = shopDataRes.data.shop;
    const storeEmail = storeInfo.email;

    // Set trial window
    const now = new Date();
    const trialEnds = new Date(now);
    trialEnds.setDate(trialEnds.getDate() + 7);

    // Save shop + access token + email + plan info
    await Shop.findOneAndUpdate(
      { shop },
      {
        shop,
        accessToken: access_token,
        email: storeEmail,
        plan: 'starter', // updated plan name
        trialStartDate: now,
        trialEndsAt: trialEnds,
        alertsUsedThisMonth: 0,
        alertLimitReached: false
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Redirect to your app’s admin interface
    const redirectUrl = `https://${shop}/admin/apps/back-in-stock-alerts`;
    return res.redirect(redirectUrl);
  } catch (err) {
    console.error('Token exchange error:', err.response?.data || err.message);
    return res.status(500).send('Error exchanging token');
  }
});

module.exports = router;
