module.exports = function generateWidgetSnippet(apiUrl) {
  return `
{% comment %} Back‑in‑Stock WhatsApp Widget Snippet {% endcomment %}
<div id="bisw-root" data-api="${apiUrl}" class="bisw">
  <div class="bisw-card">
    <div class="bisw-head">
      <div class="bisw-title">Get notified when this is back</div>
      <div class="bisw-emoji">🎉</div>
    </div>
    <p class="bisw-desc">
      Enter your WhatsApp number and we’ll message you when this item is restocked.
    </p>
    <form id="bisw-form" class="bisw-form" novalidate>
      <label for="bisw-phone">WhatsApp number</label>
      <input id="bisw-phone" type="tel" placeholder="+1 555 123 4567" required />
      <button type="submit">Notify me</button>
      <div id="bisw-msg" role="status" aria-live="polite"></div>
    </form>
  </div>
</div>
<style>
/* Add your styles here */
</style>
<script>
document.addEventListener("DOMContentLoaded", () => {
  const root = document.getElementById("bisw-root");
  const form = document.getElementById("bisw-form");
  const input = document.getElementById("bisw-phone");
  const msg = document.getElementById("bisw-msg");

  const api = root.dataset.api;
  const shop = Shopify.shop || window.location.hostname;
  const productId = window.location.pathname.split("/").pop();

  root.querySelector(".bisw-card").style.display = "block";

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.textContent = "";
    const phone = input.value.trim();
    if (!phone) {
      msg.textContent = "Please enter a valid WhatsApp number.";
      return;
    }
    try {
      const res = await fetch(\`\${api}/widget/subscribe\`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shop, productId, phone })
      });
      if (res.ok && (res.status === 200 || res.status === 204)) {
        msg.textContent = "🎉 You’re subscribed!";
        form.reset();
      } else {
        const data = await res.json().catch(() => ({}));
        msg.textContent = data.message || "Subscription failed.";
      }
    } catch {
      msg.textContent = "Error subscribing. Please try again.";
    }
  });
});
</script>
`;
};
