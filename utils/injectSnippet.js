// utils/injectSnippet.js
const axios = require("axios");

const API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-04";
const WIDGET_SRC = `${process.env.HOST}/snippetWidget.js`; // served from /public by Express

function admin(shop, accessToken) {
  const client = axios.create({
    baseURL: `https://${shop}/admin/api/${API_VERSION}/`,
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
  });
  return client;
}

async function getMainThemeId(client) {
  const { data } = await client.get("themes.json");
  const main = (data.themes || []).find(t => t.role === "main");
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

async function ensureScriptTag(client) {
  // Check existing script_tags
  const list = await client.get("script_tags.json");
  const exists = (list.data.script_tags || []).find(st => st.src === WIDGET_SRC);

  if (exists) {
    return { created: false, scriptTagId: exists.id };
  }

  // Create script tag
  const { data } = await client.post("script_tags.json", {
    script_tag: {
      event: "onload",
      src: WIDGET_SRC,
      display_scope: "online_store", // limits to Online Store; omit if you need all
    },
  });

  return { created: true, scriptTagId: data.script_tag?.id };
}

/**
 * Try to inject <script src=".../snippetWidget.js" defer></script> into theme.liquid.
 * If forbidden (403) or insufficient permissions, fall back to ScriptTag API.
 */
async function injectSnippet(shop, accessToken) {
  const client = admin(shop, accessToken);
  const scriptTagHtml = `<script src="${WIDGET_SRC}" defer></script>`;

  // Optionally: check granted scopes and short-circuit to ScriptTag if write_themes missing
  try {
    const { data } = await client.get("access_scopes.json");
    const scopes = (data.access_scopes || []).map(s => s.handle);
    const canWriteThemes = scopes.includes("write_themes");
    if (!canWriteThemes) {
      // Fall back immediately
      const st = await ensureScriptTag(client);
      return { method: "script_tag", injected: true, details: st };
    }
  } catch (e) {
    // If this call fails, proceed and let theme path attempt; we'll still catch 403.
  }

  try {
    // Theme injection path
    const themeId = await getMainThemeId(client);
    const current = await getThemeLiquid(client, themeId);

    if (alreadyInjected(current)) {
      return { method: "theme", injected: false, reason: "already_present" };
    }

    const updated = current.replace("</body>", `  ${scriptTagHtml}\n</body>`);
    if (updated === current) {
      // If </body> wasn’t found, append at end as a safe fallback
      await putThemeLiquid(client, themeId, `${current}\n${scriptTagHtml}\n`);
    } else {
      await putThemeLiquid(client, themeId, updated);
    }

    return { method: "theme", injected: true };
  } catch (err) {
    const status = err.response?.status;
    const body = err.response?.data;

    // If we hit permission issues, try ScriptTag fallback
    if (status === 403 || (body && /insufficient/i.test(JSON.stringify(body)))) {
      try {
        const st = await ensureScriptTag(client);
        return {
          method: "script_tag",
          injected: true,
          fallback: true,
          details: st,
          themeError: body || err.message,
        };
      } catch (e2) {
        throw new Error(
          `Theme injection forbidden and script_tag fallback failed: ${e2.response?.data ? JSON.stringify(e2.response.data) : e2.message}`
        );
      }
    }

    // Otherwise, bubble up the theme error
    throw new Error(
      `Theme injection failed: ${status || ""} ${
        body ? JSON.stringify(body) : err.message
      }`
    );
  }
}

module.exports = injectSnippet;
