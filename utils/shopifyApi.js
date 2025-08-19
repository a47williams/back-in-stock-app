const Shop = require('../models/Shop');
const axios = require('axios');

async function getAccessToken(shop) {
  const record = await Shop.findOne({ shop });
  if (!record || !record.accessToken) throw new Error('Missing access token for shop');
  return record.accessToken;
}

async function getLiveThemeId(shop, accessToken) {
  const url = `https://${shop}/admin/api/2024-01/themes.json`;
  const res = await axios.get(url, {
    headers: {
      'X-Shopify-Access-Token': accessToken,
    },
  });

  const theme = res.data.themes.find((t) => t.role === 'main');
  if (!theme) throw new Error('Could not find live theme');
  return theme.id;
}

async function addSnippetToTheme(shop, accessToken, themeId, snippet) {
  const url = `https://${shop}/admin/api/2024-01/assets.json`;

  const res = await axios.put(
    url,
    {
      asset: {
        key: 'snippets/bisw-widget.liquid',
        value: snippet,
      },
    },
    {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
    }
  );

  return res.status === 200;
}

module.exports = {
  getAccessToken,
  getLiveThemeId,
  addSnippetToTheme,
};
