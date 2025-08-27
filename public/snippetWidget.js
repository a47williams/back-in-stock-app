// public/snippetWidget.js
(function () {
  // Bail if merchant added the Liquid block (prevents duplicates)
  if (document.getElementById('bisw-root')) return;

  // Prevent double init if ScriptTag loads twice
  if (window.__BIS_WIDGET_INIT__) return;
  window.__BIS_WIDGET_INIT__ = true;

  const API_HOST = "https://back-in-stock-app.onrender.com";
  const WIDGET_ID = "back-in-stock-widget";

  // --- Helpers ---
  function isProductPage() {
    return !!(window.Shopify && Shopify.product) || !!document.querySelector('form[action*="/cart/add"]');
  }

  function getProduct() {
    return window?.Shopify?.product || null;
  }

  function productForm() {
    // Prefer visible product form
    const forms = Array.from(document.querySelectorAll('form[action*="/cart/add"]'));
    return forms.find(f => f.offsetParent !== null) || forms[0] || null;
  }

  function variantIdInput(form) {
    return (
      (form && (form.querySelector('input[name="id"]') || form.querySelector('select[name="id"]'))) ||
      document.querySelector('input[name="id"]') ||
      document.querySelector('select[name="id"]')
    );
  }

  function currentVariantId() {
    const input = variantIdInput(productForm());
    if (!input) return null;
    const val = input.value || input.getAttribute("value");
    const id = parseInt(val, 10);
    return Number.isFinite(id) ? id : null;
  }

  function findVariantById(id) {
    const p = getProduct();
    if (!p || !Array.isArray(p.variants)) return null;
    return p.variants.find(v => Number(v.id) === Number(id)) || null;
  }

  function isSelectedVariantSoldOut() {
    const vid = currentVariantId();
    if (!vid) return false; // if we can't tell yet, hide the widget
    const v = findVariantById(vid);
    return !!(v && v.available === false);
  }

  // --- DOM mounting (single instance) ---
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
      const form = productForm();
      if (form && form.parentNode) form.parentNode.insertBefore(container, form.nextSibling);
      else document.body.appendChild(container);
    }
    ensureSingleContainer();
    wireForm(container);
    return container;
  }

  // --- Form wiring ---
  function wireForm(container) {
    const form = container.querySelector("#bis-form");
    const phone = container.querySelector("#bis-phone");
    const msg = container.querySelector("#bis-msg");
    if (!form || form.__bisBound) return;
    form.__bisBound = true;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const value = (phone.value || "").trim();
      if (!/^\+\d{7,15}$/.test(value.replace(/\s+/g, ''))) {
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
        try { data = text ? JSON.parse(text) : {}; } catch {}
        if (res.ok) {
          msg.textContent = data.message || "🎉 You’re subscribed!";
          form.reset();
        } else {
          msg.textContent = data.message || "Subscription failed.";
        }
      } catch (err) {
        msg.textContent = "Error saving alert.";
        console.error("Widget error:", err);
      }
    });
  }

  // --- Render/show only when selected variant is out of stock ---
  function render() {
    const container = mountContainer();
    container.style.display = isSelectedVariantSoldOut() ? "block" : "none";
  }

  // --- Watch variant changes robustly ---
  function bindWatchers() {
    const form = productForm();
    if (form) {
      form.addEventListener("change", (e) => {
        const t = e.target;
        if (!t) return;
        if (t.name === "id" || t.matches('select[name^="options"]') || t.matches('input[name^="options"]')) {
          setTimeout(render, 0);
        }
      });
      const idInput = variantIdInput(form);
      if (idInput && "MutationObserver" in window) {
        new MutationObserver(() => render()).observe(idInput, { attributes: true, attributeFilter: ["value"] });
      }
    }
    document.addEventListener("variant:changed", () => setTimeout(render, 0), { passive: true });
    document.addEventListener("product:variant-change", () => setTimeout(render, 0), { passive: true });
  }

  function init() {
    if (!isProductPage()) return; // no-op on non-product pages
    // Initial + safety re-renders (for themes that populate variant id late)
    setTimeout(render, 0);
    bindWatchers();
    setTimeout(render, 150);
    setTimeout(render, 500);
    setTimeout(render, 1200);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
