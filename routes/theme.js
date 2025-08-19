const express = require("express");
const axios = require("axios");
const router = express.Router();
const generateWidgetSnippet = require("../snippetWidget");

const API_VERSION = "2023-10"; // adjust if needed

// Helper: Get the live theme ID
async function getLiveThemeId(shop, accessToken) {
  const res = await axios.get(`https://${shop}/admin/api/${API_VERSION}/themes.json`, {
    headers: {
      "X-Shopify-Access-Token": accessToken,
    },
  });

  const theme = res.data.themes.find((t) => t.role === "main");
  return theme ? theme.id : null;
}

// Helper: Upload the snippet file
async function uploadSnippet(shop, accessToken, themeId, apiUrl) {
  const snippet = generateWidgetSnippet(apiUrl);

  await axios.put(
    `https://${shop}/admin/api/${API_VERSION}/themes/${themeId}/assets.json`,
    {
      asset: {
        key: "snippets/back-in-stock-widget.liquid",
        value: snippet,
      },
    },
    {
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
    }
  );
}

// Helper: Inject snippet into main product template
async function injectIntoProductTemplate(shop, accessToken, themeId) {
  const fileKey = "sections/main-product.liquid"; // fallback to templates/product.liquid if needed

  // 1. Fetch current content
  const res = await axios.get(
    `https://${shop}/admin/api/${API_VERSION}/themes/${themeId}/assets.json`,
    {
      headers: { "X-Shopify-Access-Token": accessToken },
      params: { "asset[key]": fileKey },
    }
  );

  let content = res.data.asset.value;

  // 2. Avoid duplicate injection
  if (content.includes("back-in-stock-widget")) return;

  // 3. Inject before closing </section> or add at bottom
  const tag = "{% render 'back-in-stock-widget' %}";
  if (content.includes("</section>")) {
    content = content.replace("</section>", `${tag}\n</section>`);
  } else {
    content += `\n\n${tag}\n`;
  }

  // 4. Save back
  await axios.put(
    `https://${shop}/admin/api/${API_VERSION}/themes/${themeId}/assets.json`,
    {
      asset: {
        key: fileKey,
        value: content,
      },
    },
    {
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
    }
  );
}

// Route: POST /theme/install-widget
router.post("/install-widget", async (req, res) => {
  const shop = req.session.shop;
  const accessToken = req.session.accessToken;
  const apiUrl = process.env.HOST;

  if (!shop || !accessToken) {
    return res.status(401).json({ ok: false, error: "missing_shop_session" });
  }

  try {
    const themeId = await getLiveThemeId(shop, accessToken);
    if (!themeId) throw new Error("Could not find live theme");

    await uploadSnippet(shop, accessToken, themeId, apiUrl);
    await injectIntoProductTemplate(shop, accessToken, themeId);

    res.json({ ok: true });
  } catch (err) {
    console.error("❌ Theme injection error:", err?.message || err);
    res.status(500).json({ ok: false, error: err.message || "Theme install failed" });
  }
});

module.exports = router;
