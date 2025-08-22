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
const stripeWebhookRoutes = require("./routes/stripeWebhook");
const checkoutRoutes = require("./routes/checkout");
const { dbReady } = require("./db");

const app = express();

app.use(
  cors({
    origin: "https://back-in-stock-alerts-app.myshopify.com",
    methods: ["GET", "POST"],
  })
);

app.use("/stripe", stripeWebhookRoutes);
app.use("/auth", authRoutes);
app.use("/alerts", alertRoutes);
app.use("/webhooks", webhookRoutes);
app.use("/uninstall", uninstallRoutes);
app.use("/theme", themeRoutes);
app.use("/widget", snippetWidgetRoutes);
app.use("/checkout", checkoutRoutes);

// Serve settings page
app.use(
  "/settings",
  express.static(path.join(__dirname, "public", "settings.html"))
);

// Dashboard route
app.get("/dashboard", async (req, res) => {
  const shop = req.query.shop;
  if (!shop) return res.status(400).send("Missing shop param");

  try {
    const shopDoc = await Shop.findOne({ shop });
    if (!shopDoc) return res.status(404).send("Shop not found");

    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Northstar Dashboard</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial;
            background: #f9f9f9;
            color: #333;
            padding: 2rem;
            max-width: 600px;
            margin: auto;
          }
          h1 {
            color: #1e3a8a;
          }
          .section {
            background: #fff;
            padding: 1.5rem;
            border-radius: 8px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            margin-top: 1rem;
          }
          .label {
            font-weight: bold;
          }
          a.button {
            display: inline-block;
            margin-top: 1rem;
            padding: 10px 15px;
            background-color: #1e40af;
            color: white;
            text-decoration: none;
            border-radius: 5px;
          }
          a.button:hover {
            background-color: #1d4ed8;
          }
        </style>
      </head>
      <body>
        <h1>📊 Northstar Dashboard</h1>

        <div class="section">
          <p><span class="label">Shop:</span> ${shop}</p>
          <p><span class="label">Current Plan:</span> ${shopDoc.plan || "starter"}</p>
          <p><span class="label">Alerts Used This Month:</span> ${shopDoc.alertsUsedThisMonth || 0}</p>
          <p><span class="label">Trial Ends:</span> ${
            shopDoc.trialEndsAt?.toLocaleDateString() || "N/A"
          }</p>

          <a class="button" href="/checkout?shop=${shop}&plan=growth">⬆️ Upgrade to Growth Plan</a>
        </div>
      </body>
      </html>
    `;

    res.send(html);
  } catch (err) {
    console.error("❌ Error loading dashboard:", err);
    res.status(500).send("Server error.");
  }
});

// Root fallback
app.get("/", (req, res) => {
  res.send(`
    <h1>Back In Stock Alerts App</h1>
    <p>If you're seeing this, the app is running but accessed directly. Please use the Shopify interface to interact with the app.</p>
  `);
});

// Monthly alert reset
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

// Start server
dbReady.then(() => {
  const PORT = process.env.PORT || 10000;
  app.listen(PORT, () => {
    console.log(`✅ Server listening on port ${PORT}`);
  });
});
