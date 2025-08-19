// utils/snippetWidget.js

const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const { getAccessToken } = require("./shopifyApi");

// This reads the actual HTML+JS snippet to inject
const SNIPPET_CONTENT = fs.readFileSync(
  path.resolve(__dirname, "../snippetWidget.js"),
  "utf8"
);

// Which theme files we might inject into
const TARGET_FILES = [
  "sections/product-template.liquid",
  "sections/main-product.liquid",
  "templates/product.liquid",
];

// Core function that finds a valid theme and attempts to inject snippet
async function injectSnippet(shop, accessToken) {
  const baseUrl = `https://${shop}/admin/api/2023-04`;

  // 1. Find published theme
  const themeRes = await fetch(`${baseUrl}/themes.json`, {
    method: "GET",
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
  });
  const themeData = await themeRes.json();
  const liveTheme = themeData.themes?.find((t) => t.role === "main");

  if (!liveTheme) throw new Error("No live theme found.");

  // 2. Try injecting snippet into a known product template section
  for (const file of TARGET_FILES) {
    const assetUrl = `${baseUrl}/themes/${liveTheme.id}/assets.json?asset[key]=${file}`;
    const assetRes = await fetch(assetUrl, {
      method: "GET",
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
    });

    if (!assetRes.ok) continue; // Try next one if file not found
    const assetData = await assetRes.json();
    const originalContent = assetData?.asset?.value;
    if (!originalContent) continue;

    if (originalContent.includes("<!-- BACK-IN-STOCK-WIDGET -->")) {
      // Already injected, skip
      return { injected: false, message: "Already injected" };
    }

    // Inject snippet before closing </form> or </product-form>
    let updatedContent = null;
    if (originalContent.includes("</form>")) {
      updatedContent = originalContent.replace(
        "</form>",
        `<!-- BACK-IN-STOCK-WIDGET -->\n${SNIPPET_CONTENT}\n</form>`
      );
    } else if (originalContent.includes("</product-form>")) {
      updatedContent = originalContent.replace(
        "</product-form>",
        `<!-- BACK-IN-STOCK-WIDGET -->\n${SNIPPET_CONTENT}\n</product-form>`
      );
    }

    if (updatedContent) {
      const updateRes = await fetch(`${baseUrl}/themes/${liveTheme.id}/assets.json`, {
        method: "PUT",
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          asset: {
            key: file,
            value: updatedContent,
          },
        }),
      });

      if (!updateRes.ok) {
        const err = await updateRes.text();
        throw new Error("Failed to update theme: " + err);
      }

      return { injected: true, file };
    }
  }

  throw new Error("Could not find a suitable theme file to inject into.");
}

module.exports = { injectSnippet };
