// server.js
const express = require("express");
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

/* ---------- CORS (adjust origin for production if needed) ---------- */
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  })
);

/* ---------- Static assets (serves /public incl. snippetWidget.js) ---------- */
app.use(express.static(path.join(__dirname, "public")));

/* ---------- Webhooks that require RAW body for signature/HMAC ---------- */
// Shopify App Uninstalled webhook
app.use("/uninstall", express.raw({ type: "application/json" }), uninstallRoutes);

// Stripe webhooks (if you verify signatures)
app.use("/stripe", express.raw({ type: "application/json" }), stripeWebhookRoutes);

// Shopify webhooks (inventory_levels/update expects HMAC over raw body)
app.use("/webhooks", express.raw({ type: "application/json" }), webhookRoutes);

/* ---------- JSON body parsing for normal app routes ---------- */
app.use(express.json());

/* ---------- App routes ---------- */
app.use("/auth", authRoutes);
app.use("/alerts", alertRoutes);
app.use("/theme", themeRoutes);
app.use("/checkout", checkoutRoutes);
app.use("/widget", widgetRoutes);

/* ---------- Embedded app pages ---------- */
app.get("/settings", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "settings.html"));
});

/* ---------- Health / landing ---------- */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* ---------- Monthly usage reset ---------- */
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

/* ---------- Start server after DB is ready ---------- */
dbReady.then(() => {
  const PORT = process.env.PORT || 10000;
  app.listen(PORT, () => {
    console.log(`✅ Server listening on port ${PORT}`);
  });
});
