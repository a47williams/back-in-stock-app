// server.js
require("dotenv").config();
const express = require("express");
const session = require("express-session");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");

const authRoutes = require("./routes/auth");
const alertRoutes = require("./routes/alert");
const webhookRoutes = require("./routes/webhook");
const testRoutes = require("./routes/test");

const app = express();

// ---------- basic middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-session-secret",
    resave: false,
    saveUninitialized: true,
  })
);

// ---------- DB
(async function initDb() {
  try {
    if (!process.env.MONGO_URI) throw new Error("MONGO_URI missing");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB connected");
  } catch (e) {
    console.error("❌ Mongo connection error", e);
  }
})();

// ---------- simple Admin home (fixes 'Cannot GET /')
app.get("/", (req, res) => {
  res.type("html").send(`
    <html><body style="font-family:system-ui;padding:24px;">
      <h1>Back In Stock Alerts</h1>
      <p>App running ✅</p>
      <ul>
        <li><code>GET /health</code></li>
        <li><code>GET /alerts/debug/list</code></li>
        <li><code>GET /auth?shop=your-store.myshopify.com</code> (start OAuth)</li>
      </ul>
    </body></html>
  `);
});

// ---------- health
app.get("/health", (_req, res) => res.json({ ok: true }));

// ---------- routes
app.use("/auth", authRoutes);
app.use("/alerts", alertRoutes);
app.use("/webhook", webhookRoutes);
app.use("/test", testRoutes);

// ---------- start
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server started at http://localhost:${PORT}`);
  console.log("==> Available at your primary URL", process.env.HOST);
});
