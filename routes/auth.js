// routes/auth.js

const express = require('express');
const axios = require('axios');
const querystring = require('querystring');
const crypto = require('crypto');
const db = require('../db');
const router = express.Router();

const {
  SHOPIFY_API_KEY,
  SHOPIFY_API_SECRET,
  SCOPES,
  HOST,
} = process.env;

function buildRedirectUri() {
  return `${HOST}/auth/callback`;
}

function buildInstallUrl(shop) {
  const redirectUri = buildRedirectUri();
  const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${SHOPIFY_API_KEY}&scope=${SCOPES}&redirect_uri=${redirectUri}`;
  return installUrl;
}

function verifyHMAC(query) {
  const { hmac, ...map } = query;
  const message = querystring.stringify(map);
  const generatedHash = crypto
    .createHmac('sha256', SHOPIFY_API_SECRET)
    .update(message)
    .digest('hex');
  return generatedHash === hmac;
}

router.get('/', async (req, res) => {
  const shop = req.query.shop;
  if (!shop) return res.status(400).send('Missing shop parameter');

  const existingShop = await db.getShopByDomain(shop);
  if (existingShop) {
    return res.redirect(`https://${shop}/admin/apps`);
  }

  const installUrl = buildInstallUrl(shop);
  res.redirect(installUrl);
});

router.get('/callback', async (req, res) => {
  const { shop, code, hmac } = req.query;
  if (!shop || !code || !hmac) {
    return res.status(400).send('Required parameters missing');
  }

  if (!verifyHMAC(req.query)) {
    return res.status(400).send('HMAC validation failed');
  }

  try {
    const response = await axios.post(
      `https://${shop}/admin/oauth/access_token`,
      {
        client_id: SHOPIFY_API_KEY,
        client_secret: SHOPIFY_API_SECRET,
        code,
      }
    );

    const { access_token } = response.data;

    console.log(`✅ Access token for ${shop}:`, access_token);

    await db.saveShop({ shop, accessToken: access_token });

    res.redirect(`https://${shop}/admin/apps`);
  } catch (err) {
    console.error('Auth callback error:', err);
    res.status(500).send('Failed to get access token');
  }
});

module.exports = router;
