// server.js

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const cron = require("node-cron");
require("dotenv").config();

const authRoutes = require("./routes/auth");
const alertRoutes = require("./routes/alert");
const webhookRoutes = require("./routes/webhook");
const uninstallRoutes = require("./routes/uninstall");
const themeRoutes = require("./routes/theme");
const snippetWidgetRoutes = require("./routes/snippetWidget");
const stripeWebhookRoutes = require("./routes/stripeWebhook");
const checkoutRoutes = require("./routes/checkout");
const widgetRoutes = require("./routes/widget"); // ✅ Widget subscribe endpoint
const { dbReady } = require("./db");
const Shop = require("./models/Shop");

const app = express();

// === CORS for dev or embedded app
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
  })
);

// === Parse JSON for non-webhook routes
app.use(express.json());

// === Serve static landing page
app.use(express.static(path.join(__dirname, "public")));

// === Stripe raw webhook
app.use("/stripe", stripeWebhookRoutes);

// === Shopify App Routes
app.use("/auth", authRoutes);
app.use("/alerts", alertRoutes);
app.use("/webhooks", webhookRoutes);
app.use("/uninstall", uninstallRoutes);
app.use("/theme", themeRoutes);
app.use("/widget", snippetWidgetRoutes);
app.use("/checkout", checkoutRoutes);
app.use("/subscribe", widgetRoutes); // ✅ WhatsApp subscribe endpoint

// === Serve embedded settings page
app.get("/settings", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "settings.html"));
});

// === Root fallback
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// === Monthly alert usage reset
cron.schedule("0 0 1 * *", async () => {
  console.log("🔄 Running monthly alert usage reset...");
  try {
    const result = await Shop.updateMany({}, {
      $set: {
        alertsUsedThisMonth: 0,
        alertLimitReached: false,
      },
    });
    console.log(`✅ Reset ${result.modifiedCount} shops.`);
  } catch (err) {
    console.error("❌ Error during reset:", err);
  }
});

// === Start server after DB is ready
dbReady.then(() => {
  const PORT = process.env.PORT || 10000;
  app.listen(PORT, () => {
    console.log(`✅ Server listening on port ${PORT}`);
  });
});
