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
const twilioRoutes = require("./routes/twilio"); // <-- NEW

const { dbReady } = require("./db");
const Shop = require("./models/Shop");

const app = express();

// CORS
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
  })
);

// Parsers
app.use(express.urlencoded({ extended: false })); // <-- Twilio inbound (form-encoded)
app.use(express.json());

// Static
app.use(express.static(path.join(__dirname, "public")));

// Stripe
app.use("/stripe", stripeWebhookRoutes);

// App routes
app.use("/auth", authRoutes);
app.use("/alerts", alertRoutes);
app.use("/webhooks", webhookRoutes);
app.use("/uninstall", uninstallRoutes);
app.use("/theme", themeRoutes);
app.use("/checkout", checkoutRoutes);
app.use("/twilio", twilioRoutes); // <-- NEW

// Embedded UI
app.get("/settings", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "settings.html"));
});

// Root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Monthly reset
cron.schedule("0 0 1 * *", async () => {
  console.log("🔄 Running monthly alert usage reset...");
  try {
    const result = await Shop.updateMany({}, {
      $set: { alertsUsedThisMonth: 0, alertLimitReached: false },
    });
    console.log(`✅ Reset ${result.modifiedCount} shops.`);
  } catch (err) {
    console.error("❌ Error during reset:", err);
  }
});

// Start
dbReady.then(() => {
  const PORT = process.env.PORT || 10000;
  app.listen(PORT, () => {
    console.log(`✅ Server listening on port ${PORT}`);
  });
});
