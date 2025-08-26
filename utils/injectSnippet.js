const axios = require("axios");

async function injectSnippet(shop, accessToken) {
  const themeRes = await axios.get(`https://${shop}/admin/api/2024-04/themes.json`, {
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
  });

  const mainTheme = themeRes.data.themes.find((t) => t.role === "main");
  if (!mainTheme) throw new Error("No main theme found");

  const themeId = mainTheme.id;

  // Fetch current theme.liquid content
  const layoutRes = await axios.get(
    `https://${shop}/admin/api/2024-04/themes/${themeId}/assets.json`,
    {
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
      params: {
        "asset[key]": "layout/theme.liquid",
      },
    }
  );

  const themeLiquid = layoutRes.data.asset.value;

  const scriptTag = `<script src="https://back-in-stock-app.onrender.com/snippetWidget.js" defer></script>`;

  // Prevent double injection
  if (themeLiquid.includes(scriptTag)) return;

  // Inject before </body>
  const updatedLiquid = themeLiquid.replace("</body>", `  ${scriptTag}\n</body>`);

  // Save back to Shopify
  await axios.put(
    `https://${shop}/admin/api/2024-04/themes/${themeId}/assets.json`,
    {
      asset: {
        key: "layout/theme.liquid",
        value: updatedLiquid,
      },
    },
    {
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
    }
  );

  console.log(`✅ Injected widget script into ${shop}'s theme.liquid`);
}

module.exports = injectSnippet;
