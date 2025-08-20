const express = require('express');
const router = express.Router();
const axios = require('axios');
const querystring = require('querystring');
const crypto = require('crypto');

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const SCOPES = 'read_products,write_script_tags';
const REDIRECT_URI = `${process.env.APP_URL}/auth/callback`;

function buildAuthURL(shop) {
  const state = crypto.randomBytes(8).toString('hex');
  return {
    url: `https://${shop}/admin/oauth/authorize?` +
         querystring.stringify({
           client_id: SHOPIFY_API_KEY,
           scope: SCOPES,
           redirect_uri: REDIRECT_URI,
           state,
       }),
    state
  };
}

// 1. Start OAuth process
router.get('/', (req, res) => {
  const { shop } = req.query;

  if (!shop) {
    console.error('❌ Missing shop parameter');
    return res.status(400).send('Missing shop parameter');
  }

  const { url, state } = buildAuthURL(shop);
  req.session.state = state;

  console.log(`🔐 Redirecting to Shopify OAuth URL: ${url}`);
  res.redirect(url);
});

// 2. Handle callback
router.get('/callback', async (req, res) => {
  const { shop, code, state } = req.query;

  console.log('📦 Received OAuth callback:', req.query);

  if (!shop || !code || !state) {
    console.error('❌ Missing required parameters in callback');
    return res.status(400).send('Missing parameters');
  }

  if (state !== req.session.state) {
    console.error('❌ Invalid state detected');
    return res.status(403).send('Invalid state');
  }

  const accessTokenRequestUrl = `https://${shop}/admin/oauth/access_token`;
  const payload = {
    client_id: SHOPIFY_API_KEY,
    client_secret: SHOPIFY_API_SECRET,
    code,
  };

  try {
    const response = await axios.post(accessTokenRequestUrl, payload);
    const { access_token } = response.data;

    console.log('✅ Access token retrieved:', access_token);

    req.session.shop = shop;
    req.session.accessToken = access_token;

    res.redirect(`/settings?shop=${shop}`);
  } catch (err) {
    console.error('❌ Failed to get access token:', err.message);
    res.status(500).send('Failed to get access token');
  }
});

module.exports = router;
