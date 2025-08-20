// routes/snippetWidget.js
const express = require('express');
const axios = require('axios');
const router = express.Router();
const generateWidgetSnippet = require('../snippetWidget');

const SNIPPET_NAME = 'back-in-stock-widget';

router.get('/snippet', (req, res) => {
  const apiUrl = process.env.HOST + '/alert';
  res.set('Content-Type', 'text/plain');
  res.send(generateWidgetSnippet(apiUrl));
});

router.get('/inject-snippet', async (req, res) => {
  const { shop } = req.query;
  const session = req.session[shop];

  if (!session || !session.accessToken) {
    return res.status(401).send('Unauthorized');
  }

  try {
    const apiUrl = process.env.HOST + '/alert';
    const snippetCode = generateWidgetSnippet(apiUrl);

    const themeRes = await axios.get(`https://${shop}/admin/api/2023-10/themes.json`, {
      headers: {
        'X-Shopify-Access-Token': session.accessToken
      }
    });

    const mainTheme = themeRes.data.themes.find(t => t.role === 'main');

    // Upload the snippet
    await axios.put(`https://${shop}/admin/api/2023-10/themes/${mainTheme.id}/assets.json`, {
      asset: {
        key: `snippets/${SNIPPET_NAME}.liquid`,
        value: snippetCode
      }
    }, {
      headers: {
        'X-Shopify-Access-Token': session.accessToken
      }
    });

    // Inject into layout/theme.liquid if not already there
    const themeLiquid = await axios.get(`https://${shop}/admin/api/2023-10/themes/${mainTheme.id}/assets.json`, {
      headers: {
        'X-Shopify-Access-Token': session.accessToken
      },
      params: {
        'asset[key]': 'layout/theme.liquid'
      }
    });

    const currentContent = themeLiquid.data.asset.value;
    const renderTag = `{% render '${SNIPPET_NAME}' %}`;

    if (!currentContent.includes(renderTag)) {
      const updatedContent = currentContent.replace('</body>', `${renderTag}\n</body>`);

      await axios.put(`https://${shop}/admin/api/2023-10/themes/${mainTheme.id}/assets.json`, {
        asset: {
          key: 'layout/theme.liquid',
          value: updatedContent
        }
      }, {
        headers: {
          'X-Shopify-Access-Token': session.accessToken
        }
      });
    }

    res.send('✅ Snippet injected into theme successfully');
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send('❌ Failed to inject snippet');
  }
});

module.exports = router;
