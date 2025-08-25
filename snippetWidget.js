module.exports = function generateWidgetSnippet(apiUrl) {
  return `
{% comment %}
Back‑in‑Stock WhatsApp Widget Snippet — inserted automatically
{% endcomment %}

<div id="bisw-root" class="bisw" data-api="${apiUrl}">
  <div class="bisw-card" role="region" aria-label="Back in stock alert">
    <div class="bisw-head">
      <div class="bisw-title">Get notified when this is back</div>
      <div class="bisw-emoji" aria-hidden="true">🎉</div>
    </div>

    <p class="bisw-desc">
      Enter your WhatsApp number and we’ll message you when this item is restocked.
    </p>

    <form id="bisw-form" class="bisw-form" novalidate>
      <label class="bisw-label" for="bisw-phone">WhatsApp number</label>
      <input
        id="bisw-phone"
        name="bisw-phone"
        type="tel"
        inputmode="tel"
        autocomplete="tel"
        placeholder="+1 555 123 4567"
        class="bisw-input"
        required
        aria-describedby="bisw-help"
      />

      <button type="submit" class="bisw-btn" id="bisw-submit">Notify me</button>

      <div id="bisw-help" class="bisw-help">
        Use international format (e.g. <strong>+15551234567</strong>).
      </div>
      <div class="bisw-msg" id="bisw-msg" role="status" aria-live="polite"></div>
    </form>
  </div>
</div>

<style>
  .bisw { margin-top: 18px; }
  .bisw-card {
    display: block;
    border: 1px solid rgba(17, 24, 39, .08);
    border-radius: 16px;
    padding: 16px;
    background: #fff;
    box-shadow: 0 4px 14px rgba(0,0,0,.06);
  }
  .bisw-head { display:flex; align-items:center; gap:8px; margin-bottom:6px; }
  .bisw-title { font-size: 18px; font-weight: 700; line-height:1.2; }
  .bisw-emoji { font-size: 18px; }
  .bisw-desc { font-size: 15px; color:#444; margin: 4px 0 14px; }
  .bisw-label { font-size: 13px; color:#555; margin-bottom: 6px; display:block; }

  .bisw-input {
    width: 100%;
    font-size: 16px;
    padding: 12px 14px;
    border: 1px solid #d1d5db;
    border-radius: 12px;
    outline: none;
    margin-bottom: 10px;
  }
  .bisw-input:focus { border-color:#111827; box-shadow:0 0 0 2px rgba(17,24,39,.12); }

  .bisw-btn {
    width: 100%;
    font-size: 16px; font-weight: 700;
    padding: 12px 16px;
    border: 0; border-radius: 12px;
    background:#111827; color:#fff; cursor:pointer;
    transition: filter .15s ease;
  }
  .bisw-btn:hover { filter: brightness(1.05); }
  .bisw-btn:disabled { opacity:.6; cursor:not-allowed; }

  .bisw-help { margin-top: 8px; font-size: 12px; color:#6b7280; }
  .bisw-msg { margin-top: 10px; font-size: 14px; min-height: 1em; }
</style>

<script>
  document.addEventListener("DOMContentLoaded", function () {
    const form = document.getElementById("bisw-form");
    const phoneInput = document.getElementById("bisw-phone");
    const msg = document.getElementById("bisw-msg");
    const root = document.getElementById("bisw-root");

    const apiUrl = root.dataset.api;
    const shop = Shopify.shop || window.location.hostname.replace("www.", "");
    const productId = meta?.product?.id;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const phone = phoneInput.value.trim();
      if (!phone) {
        msg.textContent = "Please enter a phone number.";
        return;
      }

      try {
        const response = await fetch(\`\${apiUrl}/widget/subscribe\`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ shop, productId, phone }),
        });

        const result = await response.json();

        if (response.ok && result.success) {
          msg.textContent = "🎉 You’ll be notified when it’s restocked!";
          form.reset();
        } else {
          msg.textContent = result.message || "Something went wrong.";
        }
      } catch (err) {
        msg.textContent = "Failed to subscribe. Try again later.";
      }
    });
  });
</script>
`;
};
