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

// === Start server after DB is ready ===
dbReady.then(() => {
  const PORT = process.env.PORT || 10000;
  app.listen(PORT, () => {
    console.log(`✅ Server listening on port ${PORT}`);
  });
});
