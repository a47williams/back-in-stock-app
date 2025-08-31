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
const twilioRoutes = require("./routes/twilio");

const { dbReady } = require("./db");
const Shop = require("./models/Shop");

const app = express();

/* ===== CORS (embedded app + widget calls) ===== */
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  })
);

/* ===== Body parsers (Twilio uses x-www-form-urlencoded) ===== */
app.use(express.urlencoded({ extended: true })); // must be before routes for /twilio/inbound
app.use(express.json());

/* ===== Static site (landing + public assets like snippetWidget.js) ===== */
app.use(express.static(path.join(__dirname, "public")));

/* ===== Stripe webhook ===== */
app.use("/stripe", stripeWebhookRoutes);

/* ===== Shopify app routes ===== */
app.use("/auth", authRoutes);
app.use("/alerts", alertRoutes);
app.use("/webhooks", webhookRoutes);
app.use("/uninstall", uninstallRoutes);
app.use("/theme", themeRoutes);
app.use("/checkout", checkoutRoutes);

/* ===== Widget + Twilio endpoints ===== */
app.use("/widget", widgetRoutes);
app.use("/twilio", twilioRoutes);

/* ===== Embedded app settings page (optional) ===== */
app.get("/settings", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "settings.html"));
});

/* ===== Root homepage (optional) ===== */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* ===== Monthly alert usage reset ===== */
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

/* ===== Start server after DB is ready ===== */
dbReady.then(() => {
  const PORT = process.env.PORT || 10000;
  app.listen(PORT, () => {
    console.log(`✅ Server listening on port ${PORT}`);
    console.log("==> Available at your primary URL https://back-in-stock-app.onrender.com");
  });
});
