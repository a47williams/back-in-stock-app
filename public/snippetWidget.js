/* Back-in-Stock WhatsApp Widget (public/snippetWidget.js) */
(function () {
  if (window.__BIS_WIDGET_INIT__) return; // prevent double-init
  window.__BIS_WIDGET_INIT__ = true;

  const API_BASE = "https://back-in-stock-app.onrender.com";

  const qs = (sel, root) => (root || document).querySelector(sel);

  function getVariantId() {
    const idInput =
      qs('form[action*="/cart/add"] [name="id"]') ||
      qs('input[name="id"]') ||
      qs('select[name="id"]');
    if (idInput && idInput.value) return String(idInput.value);
    const fromShopify = window.Shopify?.product?.selected_or_first_available_variant?.id;
    return fromShopify ? String(fromShopify) : null;
  }

  function isSoldOut() {
    // Try reading the Add-to-cart button state/label
    const atc =
      qs('form[action*="/cart/add"] [type="submit"]') ||
      qs('button[name="add"]') ||
      qs('button.add-to-cart') ||
      qs('[data-add-to-cart]');
    if (!atc) return false;
    const disabled = atc.disabled || atc.hasAttribute('disabled');
    const label = (atc.innerText || atc.value || '').toLowerCase();
    return disabled || label.includes('sold out') || label.includes('unavailable');
  }

  function ensureContainer() {
    let root = document.getElementById("back-in-stock-widget");
    if (root) return root;

    root = document.createElement("div");
    root.id = "back-in-stock-widget";
    root.style.marginTop = "20px";
    root.innerHTML = `
      <div style="border:1px solid #d1d5db;padding:14px;border-radius:12px;max-width:420px;">
        <h3 style="margin:0 0 6px;font-weight:700;">Get notified when this is back</h3>
        <form id="bis-form">
          <label for="bis-phone" style="font-size:13px;color:#555;">WhatsApp number</label><br/>
          <input type="tel" id="bis-phone" placeholder="+15551234567" required
                 style="width:100%;margin:8px 0 10px;padding:10px;border:1px solid #d1d5db;border-radius:10px;"/>
          <button type="submit" style="width:100%;padding:10px;background:#111827;color:#fff;border:0;border-radius:10px;">
            Notify me
          </button>
          <p id="bis-msg" style="margin-top:10px;font-size:14px;"></p>
        </form>
      </div>`;

    const targetForm = qs('form[action*="/cart/add"]');
    if (targetForm && targetForm.parentNode) {
      targetForm.parentNode.insertBefore(root, targetForm.nextSibling);
    } else {
      const btn = qs('button[name="add"]') || qs('button.add-to-cart');
      if (btn && btn.parentNode) btn.parentNode.insertBefore(root, btn.nextSibling);
      else document.body.appendChild(root);
    }
    return root;
  }

  function updateVisibility(root) {
    root.style.display = isSoldOut() ? "block" : "none";
  }

  function productTitle() {
    return (
      window.Shopify?.product?.title ||
      qs('meta[property="og:title"]')?.content ||
      document.title ||
      "this item"
    );
  }

  function productUrl() {
    const canonical = qs('link[rel="canonical"]')?.href;
    const href = (canonical || location.href).split('#')[0].split('?')[0];
    return href;
  }

  function getShop() {
    return (
      window.Shopify?.shop ||
      window.Shopify?.config?.shop ||
      location.hostname
    );
  }

  function normalizePhone(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    if (s.startsWith('+')) return s;
    const digits = s.replace(/[^\d]/g, '');
    return digits ? ('+' + digits) : '';
  }

  async function onSubmit(e) {
    e.preventDefault();
    const msgEl = document.getElementById("bis-msg");
    const phoneInput = document.getElementById("bis-phone");

    const phone = normalizePhone(phoneInput.value);
    if (!/^\+\d{7,15}$/.test(phone)) {
      msgEl.textContent = "Please enter a valid phone (e.g., +15551234567).";
      msgEl.style.color = "#b91c1c";
      return;
    }

    const shop = getShop();
    const variantId = getVariantId();
    const productId = window.Shopify?.product?.id ? String(window.Shopify.product.id) : null;

    msgEl.textContent = "Saving…";
    msgEl.style.color = "#374151";

    try {
      const res = await fetch(API_BASE + "/widget/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop,
          productId,
          variantId,
          phone,
          productTitle: productTitle(),
          productUrl: productUrl()
        })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data && data.success) {
        msgEl.textContent = data.message || "You’re subscribed!";
        msgEl.style.color = "#065f46";
        e.target.reset();
      } else {
        msgEl.textContent = (data && (data.message || data.error)) || "Subscription failed.";
        msgEl.style.color = "#b91c1c";
      }
    } catch (err) {
      console.error("BIS subscribe error:", err);
      msgEl.textContent = "Network error. Please try again.";
      msgEl.style.color = "#b91c1c";
    }
  }

  function init() {
    const root = ensureContainer();
    updateVisibility(root);

    // Re-check visibility on variant changes
    ["change", "variant:changed"].forEach(evt => {
      document.addEventListener(evt, () => setTimeout(() => updateVisibility(root), 0), true);
    });

    // Observe ATC button mutations (themes flip disabled/text)
    const atc =
      qs('form[action*="/cart/add"] [type="submit"]') ||
      qs('button[name="add"]') ||
      qs('button.add-to-cart');
    if (atc && "MutationObserver" in window) {
      new MutationObserver(() => updateVisibility(root))
        .observe(atc, { attributes: true, childList: true, subtree: true });
    }

    const form = document.getElementById("bis-form");
    form && form.addEventListener("submit", onSubmit);

    // safety re-checks as theme scripts settle
    setTimeout(() => updateVisibility(root), 150);
    setTimeout(() => updateVisibility(root), 600);
  }

  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", init)
    : init();
})();
