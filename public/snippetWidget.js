// public/snippetWidget.js
(function () {
  // If merchant added the Liquid block, don’t double-render
  if (document.getElementById("bisw-root")) {
    console.debug("[BIS] Liquid block detected (#bisw-root). ScriptTag bails.");
    return;
  }

  // Prevent double init if multiple ScriptTags exist
  if (window.__BIS_WIDGET_INIT__) return;
  window.__BIS_WIDGET_INIT__ = true;

  const API_HOST = "https://back-in-stock-app.onrender.com";
  const WIDGET_ID = "back-in-stock-widget";

  // ---------- helpers ----------
  function log(...a) { try { console.debug("[BIS]", ...a); } catch {} }

  function getProduct() {
    return window?.Shopify?.product || null;
  }

  function isProductPage() {
    return !!getProduct() || !!document.querySelector('form[action*="/cart/add"]');
  }

  function productForms() {
    return Array.from(document.querySelectorAll('form[action*="/cart/add"]'));
  }

  function visibleProductForm() {
    const forms = productForms();
    return forms.find(f => f.offsetParent !== null) || forms[0] || null;
  }

  function variantIdInput() {
    const form = visibleProductForm();
    return (
      (form && (form.querySelector('input[name="id"]') || form.querySelector('select[name="id"]'))) ||
      document.querySelector('input[name="id"]') ||
      document.querySelector('select[name="id"]')
    );
  }

  function currentVariantId() {
    const input = variantIdInput();
    if (!input) return null;
    const val = input.value || input.getAttribute("value");
    const id = parseInt(val, 10);
    return Number.isFinite(id) ? id : null;
  }

  function findVariantById(vid) {
    const p = getProduct();
    if (!p || !Array.isArray(p.variants)) return null;
    return p.variants.find(v => Number(v.id) === Number(vid)) || null;
  }

  function atcButton() {
    return (
      document.querySelector('form[action*="/cart/add"] [type="submit"]') ||
      document.querySelector('button[name="add"]') ||
      document.querySelector('button.add-to-cart') ||
      null
    );
  }

  // Main availability check:
  // 1) Prefer Shopify.product variant.available
  // 2) Fallback: ATC disabled or text says "sold out"/"unavailable"
  function isSelectedVariantSoldOut() {
    const vid = currentVariantId();
    const v = vid ? findVariantById(vid) : null;

    if (v && typeof v.available === "boolean") {
      const out = v.available === false;
      log("variant availability (API):", { vid, available: v.available, out });
      return out;
    }

    const atc = atcButton();
    if (atc) {
      const disabled = atc.disabled || atc.hasAttribute("disabled");
      const label = (atc.innerText || atc.value || "").toLowerCase();
      const out = disabled || /sold\s*out|unavailable/.test(label);
      log("variant availability (ATC fallback):", { disabled, label, out });
      return out;
    }

    log("variant availability unknown; hiding widget");
    return false;
  }

  // ---------- DOM mounting (single instance) ----------
  function ensureSingleContainer() {
    const all = Array.from(document.querySelectorAll(`#${CSS.escape(WIDGET_ID)}`));
    if (all.length > 1) for (let i = 1; i < all.length; i++) all[i].remove();
    return all[0] || null;
  }

  function createContainer() {
    const c = document.createElement("div");
    c.id = WIDGET_ID;
    c.style.marginTop = "20px";
    c.style.display = "none";
    c.innerHTML = `
      <div style="border: 1px solid #ccc; padding: 15px; max-width: 400px;">
        <h3>Get notified when this is back</h3>
        <form id="bis-form">
          <label for="bis-phone">WhatsApp number</label><br>
          <input type="tel" id="bis-phone" placeholder="+15551234567" required style="width: 100%; margin: 10px 0;" />
          <button type="submit" style="width: 100%; padding: 10px; background: black; color: white;">Notify me</button>
          <p id="bis-msg" style="margin-top: 10px;"></p>
        </form>
      </div>
    `;
    return c;
  }

  function mountContainer() {
    let container = ensureSingleContainer();
    if (!container) {
      container = createContainer();
      const form = visibleProductForm();
      if (form && form.parentNode) form.parentNode.insertBefore(container, form.nextSibling);
      else document.body.appendChild(container);
    }
    ensureSingleContainer();
    wireForm(container);
    return container;
  }

  // ---------- form wiring ----------
  function wireForm(container) {
    const form = container.querySelector("#bis-form");
    const phone = container.querySelector("#bis-phone");
    const msg = container.querySelector("#bis-msg");
    if (!form || form.__bisBound) return;
    form.__bisBound = true;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const value = (phone.value || "").trim();
      if (!/^\+\d{7,15}$/.test(value.replace(/\s+/g, ""))) {
        msg.textContent = "Please enter a valid phone number.";
        return;
      }
      msg.textContent = "Saving...";

      try {
        const productId = getProduct()?.id;
        const shopDomain = window?.Shopify?.shop || window?.Shopify?.checkout?.shopify_domain;
        const res = await fetch(`${API_HOST}/widget/subscribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shop: shopDomain, productId, phone: value }),
        });

        const text = await res.text();
        let data = {};
        try { data = text ? JSON.parse(text) : {}; } catch (e) { log("JSON parse error", e); }

        if (res.ok) {
          msg.textContent = data.message || "🎉 You’re subscribed!";
          form.reset();
        } else {
          msg.textContent = data.message || "Subscription failed.";
        }
      } catch (err) {
        msg.textContent = "Error saving alert.";
        console.error("[BIS] submit error:", err);
      }
    });
  }

  // ---------- visibility control ----------
  function render() {
    const container = mountContainer();
    const show = isSelectedVariantSoldOut();
    container.style.display = show ? "block" : "none";
    log("render:", { show, vid: currentVariantId() });
  }

  function bindWatchers() {
    const form = visibleProductForm();
    if (form) {
      form.addEventListener("change", (e) => {
        const t = e.target;
        if (!t) return;
        if (t.name === "id" || t.matches('select[name^="options"]') || t.matches('input[name^="options"]')) {
          setTimeout(render, 0);
        }
      });

      const idInput = variantIdInput();
      if (idInput && "MutationObserver" in window) {
        new MutationObserver(() => render()).observe(idInput, {
          attributes: true,
          attributeFilter: ["value"],
        });
      }
    }
    document.addEventListener("variant:changed", () => setTimeout(render, 0), { passive: true });
    document.addEventListener("product:variant-change", () => setTimeout(render, 0), { passive: true });
  }

  function init() {
    if (!isProductPage()) {
      log("not a product page; skipping");
      return;
    }

    // initial + safety re-renders for themes that fill variant id late
    setTimeout(render, 0);
    bindWatchers();
    setTimeout(render, 150);
    setTimeout(render, 500);
    setTimeout(render, 1200);
    setTimeout(render, 2000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
