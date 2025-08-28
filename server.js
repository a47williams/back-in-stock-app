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
const stripeWebhookRoutes = require("./routes/stripeWebhook");
const checkoutRoutes = require("./routes/checkout");
const widgetRoutes = require("./routes/widget");
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

// === Public assets (landing page + snippetWidget.js)
app.use(express.static(path.join(__dirname, "public"))); // ✅ Static website folder

// --- Webhook routes that require RAW body for HMAC/signature verification ---
// ✅ Shopify App Uninstalled webhook (expects raw body for HMAC)
app.use("/uninstall", express.raw({ type: "application/json" }), uninstallRoutes);

// ✅ Stripe webhooks (Stripe requires raw body for signature verification)
// If your stripeWebhookRoutes already parse JSON internally, ensure they read req.body as Buffer.
app.use("/stripe", express.raw({ type: "application/json" }), stripeWebhookRoutes);

// If you also verify HMAC for other Shopify webhooks in routes/webhook.js,
// consider mounting them with express.raw too. If not, keep JSON parsing below.

// === Parse JSON for the rest of the app
app.use(express.json());

// === Shopify app routes
app.use("/auth", authRoutes);
app.use("/alerts", alertRoutes);
app.use("/webhooks", webhookRoutes); // If you need raw here, mount before express.json with express.raw
app.use("/theme", themeRoutes);
app.use("/checkout", checkoutRoutes);
app.use("/widget", widgetRoutes);


// === Serve embedded app HTML (optional)
app.get("/settings", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "settings.html"));
});

// === Root fallback (optional for debugging)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html")); // ✅ Homepage
});

// === Monthly alert usage reset
cron.schedule("0 0 1 * *", async () => {
  console.log("🔄 Running monthly alert usage reset...");
  try {
    const result = await Shop.updateMany(
      {},
      {
        $set: {
          alertsUsedThisMonth: 0,
          alertLimitReached: false,
        },
      }
    );
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
