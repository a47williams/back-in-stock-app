const express = require('express');
const router = express.Router();
const shopifyApi = require('../utils/shopifyApi');
const snippetWidget = require('../snippetWidget');

router.post('/inject', ensureHmac, async (req, res) => {
  const shop = req.body.shop;
  if (!shop) return res.status(400).json({ ok: false, error: 'Missing shop domain' });

  try {
    const accessToken = await shopifyApi.getAccessToken(shop);
    const themeId = await shopifyApi.getLiveThemeId(shop, accessToken);
    const snippet = await snippetWidget.build(shop);

    const result = await shopifyApi.addSnippetToTheme(shop, accessToken, themeId, snippet);
    if (result) {
      return res.json({ ok: true });
    } else {
      return res.status(500).json({ ok: false, error: 'Failed to inject snippet' });
    }
  } catch (err) {
    console.error('Inject error:', err);
    return res.status(500).json({ ok: false, error: err.message || 'Unknown error' });
  }
});

module.exports = router;
