const cron = require("node-cron");
const Shop = require("./models/Shop");

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const authRoutes = require("./routes/auth");
const alertRoutes = require("./routes/alert");
const webhookRoutes = require("./routes/webhook");
const uninstallRoutes = require("./routes/uninstall");
const themeRoutes = require("./routes/theme");
const snippetWidgetRoutes = require("./routes/snippetWidget");

const { dbReady } = require("./db");

const app = express();

// === Enable CORS for Shopify store ===
app.use(
  cors({
    origin: "https://back-in-stock-alerts-app.myshopify.com",
    methods: ["GET", "POST"],
  })
);

// === Shopify app routes ===
app.use("/auth", authRoutes);
app.use("/alerts", alertRoutes);
app.use("/webhooks", webhookRoutes);
app.use("/uninstall", uninstallRoutes);
app.use("/theme", themeRoutes);
app.use("/widget", snippetWidgetRoutes);

// === Serve settings.html for embedded app views ===
app.use("/settings", express.static(path.join(__dirname, "public", "settings.html")));

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
