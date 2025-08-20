// routes/auth.js

const express = require('express');
const axios = require('axios');
const router = express.Router();
const querystring = require('querystring');

const {
  SHOPIFY_API_KEY,
  SHOPIFY_API_SECRET,
  SCOPES,
  HOST,
} = process.env;

const REDIRECT_URI = `${HOST}/auth/callback`;

function buildInstallUrl(shop) {
  const installUrl = `https://${shop}/admin/oauth/authorize?` +
    querystring.stringify({
      client_id: SHOPIFY_API_KEY,
      scope: SCOPES,
      redirect_uri: REDIRECT_URI,
    });

  return installUrl;
}

function buildAccessTokenRequestUrl(shop) {
  return `https://${shop}/admin/oauth/access_token`;
}

function buildAccessTokenPayload(code) {
  return {
    client_id: SHOPIFY_API_KEY,
    client_secret: SHOPIFY_API_SECRET,
    code,
  };
}

router.get('/', (req, res) => {
  const shop = req.query.shop;

  if (!shop) {
    return res.status(400).send('Missing shop parameter.');
  }

  const installUrl = buildInstallUrl(shop);
  res.redirect(installUrl);
});

router.get('/callback', async (req, res) => {
  const { shop, code } = req.query;

  if (!shop || !code) {
    return res.status(400).send('Required parameters missing.');
  }

  const accessTokenRequestUrl = buildAccessTokenRequestUrl(shop);
  const payload = buildAccessTokenPayload(code);

  try {
    const response = await axios.post(accessTokenRequestUrl, payload);
    const accessToken = response.data.access_token;

    // TODO: Save the access token in your DB for future API calls

    res.redirect(`https://${shop}/admin/apps`);
  } catch (error) {
    console.error('Access Token Error:', error.response?.data || error.message);
    res.status(500).send('OAuth callback processing failed.');
  }
});

module.exports = router;
