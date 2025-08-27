// utils/injectSnippet.js
const axios = require("axios");

const API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-04";
const WIDGET_SRC = `${process.env.HOST}/snippetWidget.js`; // served from /public by Express

function admin(shop, accessToken) {
  return axios.create({
    baseURL: `https://${shop}/admin/api/${API_VERSION}/`,
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
  });
}

async function getAccessScopes(client) {
  try {
    const { data } = await client.get("access_scopes.json");
    return new Set((data.access_scopes || []).map((s) => s.handle));
  } catch {
    // If we can't read scopes, we’ll just try the paths and handle errors.
    return null;
  }
}

async function getMainThemeId(client) {
  const { data } = await client.get("themes.json");
  const main = (data.themes || []).find((t) => t.role === "main");
  if (!main) throw new Error("No main theme found");
  return main.id;
}

async function getThemeLiquid(client, themeId) {
  const { data } = await client.get(`themes/${themeId}/assets.json`, {
    params: { "asset[key]": "layout/theme.liquid" },
  });
  return data.asset?.value || "";
}

function alreadyInjected(themeLiquid) {
  return themeLiquid.includes(WIDGET_SRC);
}

async function putThemeLiquid(client, themeId, newLiquid) {
  await client.put(`themes/${themeId}/assets.json`, {
    asset: { key: "layout/theme.liquid", value: newLiquid },
  });
}

async function injectViaTheme(client, scriptTagHtml) {
  const themeId = await getMainThemeId(client);
  const current = await getThemeLiquid(client, themeId);

  if (alreadyInjected(current)) {
    return { method: "theme", injected: false, reason: "already_present" };
  }

  const updated = current.includes("</body>")
    ? current.replace("</body>", `  ${scriptTagHtml}\n</body>`)
    : `${current}\n${scriptTagHtml}\n`;

  await putThemeLiquid(client, themeId, updated);
  return { method: "theme", injected: true };
}

async function injectViaScriptTag(client) {
  try {
    const { data } = await client.post("script_tags.json", {
      script_tag: {
        event: "onload",
        src: WIDGET_SRC,
        display_scope: "online_store",
      },
    });
    return { created: true, id: data.script_tag?.id || null };
  } catch (err) {
    const status = err.response?.status;
    const body = err.response?.data;
    const msg = JSON.stringify(body || {});
    // If already exists, Shopify returns 422 like: {"errors":{"src":["has already been taken"]}}
    if (status === 422 && /has already been taken/i.test(msg)) {
      return { created: false, reason: "already_present" };
    }
    throw new Error(body?.errors ? JSON.stringify(body.errors) : err.message);
  }
}

/**
 * Try theme injection if write_themes is present; otherwise fall back to ScriptTag.
 * ScriptTag path creates directly (no read_script_tags needed).
 */
async function injectSnippet(shop, accessToken) {
  const client = admin(shop, accessToken);
  const scriptTagHtml = `<script src="${WIDGET_SRC}" defer></script>`;

  const scopes = await getAccessScopes(client);
  const canWriteThemes = scopes ? scopes.has("write_themes") : null;

  // Prefer theme injection when allowed
  if (canWriteThemes) {
    try {
      const r = await injectViaTheme(client, scriptTagHtml);
      return r;
    } catch (e) {
      // Fall through to ScriptTag on any theme error
    }
  }

  // ScriptTag injection (no read_script_tags needed)
  try {
    const st = await injectViaScriptTag(client);
    return { method: "script_tag", injected: true, details: st };
  } catch (e) {
    throw new Error(
      `ScriptTag injection failed: ${e.message}. Ensure app scope "write_script_tags" is granted and re-install if needed.`
    );
  }
}

module.exports = injectSnippet;
