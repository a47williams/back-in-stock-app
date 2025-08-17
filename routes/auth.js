// routes/auth.js
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const Shop = require('../models/Shop');

const router = express.Router();

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const SCOPES = process.env.SCOPES || 'read_products,read_inventory,write_customers';
const HOST = process.env.HOST; // e.g. https://back-in-stock-app.onrender.com

// 1) Install link: /auth/install?shop=<store>.myshopify.com
router.get('/install', (req, res) => {
  const { shop } = req.query;
  if (!shop) return res.status(400).send('Missing shop');

  const state = crypto.randomBytes(16).toString('hex');
  const redirectUri = `${HOST}/auth/callback`;

  const installUrl =
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${SHOPIFY_API_KEY}` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}`;

  return res.redirect(installUrl);
});

// 2) OAuth callback: exchanges code → access token, saves it, registers webhook
router.get('/callback', async (req, res) => {
  try {
    const { shop, code } = req.query;
    if (!shop || !code) return res.status(400).send('Missing shop or code');

    // Exchange code for token
    const tokenResp = await axios.post(`https://${shop}/admin/oauth/access_token`, {
      client_id: SHOPIFY_API_KEY,
      client_secret: SHOPIFY_API_SECRET,
      code
    }, { headers: { 'Content-Type': 'application/json' } });

    const accessToken = tokenResp.data.access_token;

    // ✅ Save or update token for this shop
    await Shop.findOneAndUpdate(
      { shop },
      { shop, accessToken },
      { upsert: true, new: true }
    );

    // Register webhook: Inventory levels update → our Render URL
    try {
      await axios.post(
        `https://${shop}/admin/api/2025-07/webhooks.json`,
        {
          webhook: {
            topic: 'inventory_levels/update',
            address: `${HOST}/webhook/inventory`,
            format: 'json'
          }
        },
        { headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' } }
      );
      console.log('✅ Webhook registered for inventory_levels/update');
    } catch (e) {
      console.error('⚠️ Webhook register failed:', e.response?.data || e.message);
    }

    // Simple success page
    return res.status(200).send('✅ App installed & webhook registered. You can close this tab.');
  } catch (err) {
    console.error('OAuth/webhook error:', err.response?.data || err.message);
    return res.status(500).send('OAuth/webhook failed');
  }
});

module.exports = router;
