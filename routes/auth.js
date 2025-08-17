// back-in-stock-app/routes/auth.js
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const axios = require('axios');

const apiVersion = process.env.SHOPIFY_API_VERSION || '2023-10';

function getEnvOrFail() {
  const out = {
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecret: process.env.SHOPIFY_API_SECRET,
    scopes: process.env.SCOPES,
    host: process.env.HOST,
  };
  const missing = Object.entries(out)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  return { ...out, missing };
}

router.get('/install', (req, res) => {
  const { apiKey, scopes, host, missing } = getEnvOrFail();
  if (missing.length) {
    return res
      .status(500)
      .send(`Missing env vars: ${missing.join(', ')}. Check your .env and restart the server.`);
  }

  const shop = (req.query.shop || '').trim();
  if (!shop || !shop.endsWith('.myshopify.com')) {
    return res.status(400).send('Missing or invalid ?shop=<store>.myshopify.com');
  }

  const state = crypto.randomBytes(8).toString('hex');
  const redirectUri = `${host}/auth/callback`;

  const installUrl = new URL(`https://${shop}/admin/oauth/authorize`);
  installUrl.searchParams.set('client_id', apiKey);
  installUrl.searchParams.set('scope', scopes);
  installUrl.searchParams.set('state', state);
  installUrl.searchParams.set('redirect_uri', redirectUri);

  return res.redirect(installUrl.toString());
});

router.get('/callback', async (req, res) => {
  const { apiKey, apiSecret, host, missing } = getEnvOrFail();
  if (missing.length) {
    return res
      .status(500)
      .send(`Missing env vars: ${missing.join(', ')}. Check your .env and restart the server.`);
  }

  const { shop, code } = req.query;
  if (!shop || !code) return res.status(400).send('Missing shop or code');

  try {
    // Exchange code for token
    const tokenResp = await axios.post(`https://${shop}/admin/oauth/access_token`, {
      client_id: apiKey,
      client_secret: apiSecret,
      code,
    });
    const accessToken = tokenResp.data.access_token;

    req.session.shop = shop;
    req.session.accessToken = accessToken;

    // Idempotent webhook upsert for products/update
    const headers = {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    };
    const address = `${host}/webhook/inventory`;
    const topic = 'products/update';

    const list = await axios.get(
      `https://${shop}/admin/api/${apiVersion}/webhooks.json?topic=${encodeURIComponent(topic)}`,
      { headers }
    );
    const existing = (list.data?.webhooks || []).find(w => w.address === address);

    if (!existing) {
      await axios.post(
        `https://${shop}/admin/api/${apiVersion}/webhooks.json`,
        { webhook: { topic, address, format: 'json' } },
        { headers }
      );
      console.log(`✅ Webhook created -> ${address}`);
    } else {
      console.log(`🔁 Webhook exists (${existing.id}) -> ${address}`);
    }

    return res.send('✅ App installed & webhook registered. You can close this tab.');
  } catch (error) {
    console.error('OAuth/webhook error', {
      status: error?.response?.status,
      data: error?.response?.data,
      message: error.message,
    });
    return res.status(500).send('OAuth/webhook failed — see server logs.');
  }
});

module.exports = router;
