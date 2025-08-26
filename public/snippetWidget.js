(function () {
  async function loadWidget() {
    const productId = window?.Shopify?.product?.id;
    const variant = window?.Shopify?.product?.variants?.[0];
    const available = variant?.available;

    if (available) return;

    const container = document.createElement("div");
    container.id = "back-in-stock-widget";
    container.style.marginTop = "20px";

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

    const target = document.querySelector("form[action^='/cart/add']") || document.querySelector("button[type='submit']");
    if (target?.parentNode) {
      target.parentNode.insertBefore(container, target.nextSibling);
    }

    const form = document.getElementById("bis-form");
    const phone = document.getElementById("bis-phone");
    const msg = document.getElementById("bis-msg");

    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const value = phone.value.trim();
      if (!value.startsWith("+") || value.length < 10) {
        msg.textContent = "Please enter a valid phone number.";
        return;
      }

      msg.textContent = "Saving...";

      const apiUrl = "https://back-in-stock-app.onrender.com";

      try {
        const res = await fetch(`${apiUrl}/widget/subscribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shop: Shopify.shop,
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadWidget);
  } else {
    loadWidget();
  }
})();
