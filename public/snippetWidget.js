(function () {
  if (document.getElementById('bisw-root')) { /* Liquid widget exists; bail */ return; }

  // ---- Guard: prevent double-initialization on the same page load ----
  if (window.__BIS_WIDGET_INIT__) return;
  window.__BIS_WIDGET_INIT__ = true;

  // Your API host serving /widget/subscribe and this file
  const API_HOST = "https://back-in-stock-app.onrender.com";
  const WIDGET_ID = "back-in-stock-widget";

  function getProduct() {
    return window?.Shopify?.product || null;
  }

  function getProductForm() {
    return (
      document.querySelector('form[action^="/cart/add"]') ||
      document.querySelector("form[action*='/cart/add']") ||
      document.querySelector("form[data-type='add-to-cart-form']") ||
      document.querySelector("form[method='post']") // fallback
    );
  }

  function getVariantIdInput(form) {
    return (
      (form && form.querySelector('input[name="id"]')) ||
      document.querySelector('input[name="id"]') ||
      document.querySelector('select[name="id"]')
    );
  }

  function getCurrentVariantId() {
    const form = getProductForm();
    const input = getVariantIdInput(form);
    if (!input) return null;
    // select vs input
    const val = input.value || input.getAttribute("value");
    if (!val) return null;
    const id = parseInt(val, 10);
    return Number.isFinite(id) ? id : null;
  }

  function findVariantById(variantId) {
    const product = getProduct();
    if (!product || !Array.isArray(product.variants)) return null;
    return product.variants.find((v) => Number(v.id) === Number(variantId)) || null;
  }

  function isCurrentVariantSoldOut() {
    const vid = getCurrentVariantId();
    if (!vid) return false;
    const v = findVariantById(vid);
    // If variant info is missing, be conservative and hide the widget
    if (!v || typeof v.available !== "boolean") return false;
    return v.available === false;
  }

  function ensureContainer() {
    let container = document.getElementById(WIDGET_ID);
    if (container) return container;

    container = document.createElement("div");
    container.id = WIDGET_ID;
    container.style.marginTop = "20px";
    container.style.display = "none"; // hidden until we decide to show

    container.innerHTML = `
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

    const target =
      document.querySelector("form[action^='/cart/add']") ||
      document.querySelector("button[type='submit']") ||
      document.querySelector("product-form") ||
      document.body;

    if (target && target.parentNode) {
      target.parentNode.insertBefore(container, target.nextSibling);
    } else {
      document.body.appendChild(container);
    }

    wireForm(container);
    return container;
  }

  function wireForm(container) {
    const form = container.querySelector("#bis-form");
    const phone = container.querySelector("#bis-phone");
    const msg = container.querySelector("#bis-msg");

    if (!form || form.__bisBound) return; // avoid double binding
    form.__bisBound = true;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const value = (phone.value || "").trim();
      if (!value.startsWith("+") || value.length < 10) {
        msg.textContent = "Please enter a valid phone number.";
        return;
      }

      msg.textContent = "Saving...";

      // Derive current product + variant
      const productId = getProduct()?.id;
      const shopDomain = window?.Shopify?.shop || window?.Shopify?.checkout?.shopify_domain;

      try {
        const res = await fetch(`${API_HOST}/widget/subscribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shop: shopDomain,
            productId,
            phone: value,
          }),
        });

        const text = await res.text();
        let data = {};
        try {
          data = text ? JSON.parse(text) : {};
        } catch (err) {
          console.error("JSON parse error:", err);
        }

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

  function render() {
    const container = ensureContainer();
    // Show only if selected variant is sold out
    if (isCurrentVariantSoldOut()) {
      container.style.display = "block";
    } else {
      container.style.display = "none";
    }
  }

  // Watch for variant changes (various theme patterns)
  function bindVariantWatchers() {
    const form = getProductForm();
    if (!form) return;

    // 1) Listen to change events on selects/radios within the product form
    form.addEventListener("change", (e) => {
      const target = e.target;
      if (!target) return;
      // fire when options or id change
      if (
        target.matches("select") ||
        target.matches('input[type="radio"]') ||
        target.getAttribute("name") === "id"
      ) {
        // small delay to let theme update hidden id input
        setTimeout(render, 0);
      }
    });

    // 2) Hidden input[name=id] may change programmatically; observe it
    const idInput = getVariantIdInput(form);
    if (idInput) {
      const obs = new MutationObserver(() => render());
      obs.observe(idInput, { attributes: true, attributeFilter: ["value"] });
    }

    // 3) Some themes dispatch custom events; listen if present
    document.addEventListener("variant:changed", () => setTimeout(render, 0), { passive: true });
    document.addEventListener("product:variant-change", () => setTimeout(render, 0), { passive: true });
  }

  function init() {
    // If a duplicate script also runs, this guard at top blocks it.
    // Also ensure we only place ONE widget by reusing #back-in-stock-widget.
    render();
    bindVariantWatchers();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
