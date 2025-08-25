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

// === Parse JSON
app.use(express.json());

// === Serve public folder for landing page
app.use(express.static(path.join(__dirname, "public"))); // ✅ Static website folder

// === Stripe webhook
app.use("/stripe", stripeWebhookRoutes);

// === Shopify app routes
app.use("/auth", authRoutes);
app.use("/alerts", alertRoutes);
app.use("/webhooks", webhookRoutes);
app.use("/uninstall", uninstallRoutes);
app.use("/theme", themeRoutes);

app.use("/checkout", checkoutRoutes);

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
