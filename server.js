// server.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const session = require("express-session");
const morgan = require("morgan");

// Initialize DB connection on import (and export mongoose for health)
const { mongoose } = require("./db");

// ---- Routes
const authRoutes = require("./routes/auth");
const alertRoutes = require("./routes/alert");
const webhookRoutes = require("./routes/webhook");
const testRoutes = require("./routes/test");

// ---- App
const app = express();
app.set("trust proxy", 1);

// Basic middleware
app.use(morgan("tiny"));
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

// Sessions (used for OAuth handshake & storing shop tokens)
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-session-secret";
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      sameSite: "lax",
      secure: "auto",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  })
);

// JSON parsing for API endpoints
app.use(express.json());

// ---------- Index (handy links for quick checks)
app.get("/", (_req, res) => {
  const host = process.env.HOST || "https://back-in-stock-app.onrender.com";
  res.type("html").send(`<!doctype html>
  <html>
    <head><meta charset="utf-8"><title>Back In Stock App</title></head>
    <body style="font-family: ui-sans-serif, system-ui; line-height:1.5; padding:20px;">
      <h2>Back In Stock App</h2>
      <ul>
        <li><code>GET ${host}/health</code></li>
        <li><code>GET ${host}/alerts/debug/list</code></li>
        <li><code>GET ${host}/auth?shop=your-store.myshopify.com</code></li>
      </ul>
    </body>
  </html>`);
});

// ---------- Health (shows DB state + which env keys are present)
app.get("/health", (_req, res) => {
  const states = ["disconnected", "connected", "connecting", "disconnecting", "invalid"];
  const dbState = states[mongoose.connection.readyState] || "unknown";

  res.json({
    ok: true,
    db: dbState,
    env: {
      HOST: !!process.env.HOST,
      MONGO_URI: !!process.env.MONGO_URI,       // preferred key
      MONGODB_URI: !!process.env.MONGODB_URI,   // legacy alt if you use it
      SHOPIFY_API_KEY: !!process.env.SHOPIFY_API_KEY,
      SHOPIFY_API_SECRET: !!process.env.SHOPIFY_API_SECRET,
      SESSION_SECRET: !!process.env.SESSION_SECRET,
      TWILIO_ACCOUNT_SID: !!process.env.TWILIO_ACCOUNT_SID,
      TWILIO_AUTH_TOKEN: !!process.env.TWILIO_AUTH_TOKEN,
      TWILIO_FROM: !!process.env.TWILIO_FROM,
      HMAC_MODE: process.env.HMAC_MODE || "lenient",
      SKIP_HMAC: process.env.SKIP_HMAC === "true",
    },
    ts: new Date().toISOString(),
  });
});

// ---------- Mount feature routes
app.use("/auth", authRoutes);
app.use("/alerts", alertRoutes);
app.use("/webhook", webhookRoutes);
app.use("/test", testRoutes);

// ---------- 404
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Not found", path: req.originalUrl });
});

// ---------- Error handler
// (ensures we don't leak stack traces to the client)
app.use((err, _req, res, _next) => {
  console.error("💥 Unhandled error:", err);
  const status = err.status || 500;
  res.status(status).json({
    ok: false,
    error: err.message || "Internal server error",
  });
});

// ---------- Start
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("=> Server started at http://localhost:" + PORT);
  if (process.env.HOST) console.log("=> Available at your primary URL", process.env.HOST);
});

module.exports = app;
