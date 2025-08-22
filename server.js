const cron = require("node-cron");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const Shop = require("./models/Shop");

const authRoutes = require("./routes/auth");
const alertRoutes = require("./routes/alert");
const webhookRoutes = require("./routes/webhook");
const uninstallRoutes = require("./routes/uninstall");
const themeRoutes = require("./routes/theme");
const snippetWidgetRoutes = require("./routes/snippetWidget");
const stripeWebhookRoutes = require("./routes/stripeWebhook");
const checkoutRoutes = require("./routes/checkout");
const { dbReady } = require("./db");

const app = express();

// === Enable CORS for Shopify store ===
app.use(
  cors({
    origin: "https://back-in-stock-alerts-app.myshopify.com",
    methods: ["GET", "POST"],
  })
);

// === Stripe webhook (raw body middleware required)
app.use("/stripe", stripeWebhookRoutes);

// === Shopify app routes ===
app.use("/auth", authRoutes);
app.use("/alerts", alertRoutes);
app.use("/webhooks", webhookRoutes);
app.use("/uninstall", uninstallRoutes);
app.use("/theme", themeRoutes);
app.use("/widget", snippetWidgetRoutes);
app.use("/checkout", checkoutRoutes);

// === Serve settings.html for embedded app views ===
app.use("/settings", express.static(path.join(__dirname, "public", "settings.html")));

// === Manual usage reset route (for cron-job.org or manual trigger) ===
app.get("/reset-alert-usage", async (req, res) => {
  try {
    const result = await Shop.updateMany(
      {},
      {
        $set: {
          alertsUsedThisMonth: 0,
          alertLimitReached: false
        }
      }
    );
    console.log(`✅ Manually reset ${result.modifiedCount} shops.`);
    res.status(200).send(`✅ Reset ${result.modifiedCount} shops.`);
  } catch (err) {
    console.error("❌ Error during manual reset:", err);
    res.status(500).send("Error resetting usage.");
  }
});

// === Merchant dashboard (basic MVP) ===
app.get("/dashboard", async (req, res) => {
  const shop = req.query.shop;
  if (!shop) return res.status(400).send("Missing shop param");

  try {
    const shopDoc = await Shop.findOne({ shop });
    if (!shopDoc) return res.status(404).send("Shop not found");

    const html = `
      <h1>📊 Northstar Dashboard</h1>
      <p><strong>Shop:</strong> ${shop}</p>
      <p><strong>Current Plan:</strong> ${shopDoc.plan || "starter"}</p>
      <p><strong>Alerts Used This Month:</strong> ${shopDoc.alertsUsedThisMonth || 0}</p>
      <p><strong>Trial Ends:</strong> ${shopDoc.trialEndsAt?.toLocaleDateString() || "N/A"}</p>
      <a href="/checkout?shop=${shop}&plan=growth">⬆️ Upgrade to Growth Plan</a>
    `;
    res.send(html);
  } catch (err) {
    console.error("❌ Error loading dashboard:", err);
    res.status(500).send("Server error.");
  }
});

// === Root route fallback ===
app.get("/", (req, res) => {
  res.send(`
    <h1>Back In Stock Alerts App</h1>
    <p>If you're seeing this, the app is running but accessed directly. Please use the Shopify interface to interact with the app.</p>
  `);
});

// === Schedule monthly alert usage reset ===
cron.schedule("0 0 1 * *", async () => {
  console.log("🔄 Running monthly alert usage reset...");

  try {
    const result = await Shop.updateMany(
      {},
      {
        $set: {
          alertsUsedThisMonth: 0,
          alertLimitReached: false
        }
      }
    );
    console.log(`✅ Reset ${result.modifiedCount} shops.`);
  } catch (err) {
    console.error("❌ Error during reset:", err);
  }
});

// === Start server after DB is ready ===
dbReady.then(() => {
  const PORT = process.env.PORT || 10000;
  app.listen(PORT, () => {
    console.log(`✅ Server listening on port ${PORT}`);
  });
});
