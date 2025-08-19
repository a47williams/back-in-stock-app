// server.js
require("dotenv").config();

const express = require("express");
const session = require("express-session");
const cors = require("cors");

// Initialize DB (safe to require even if you already connect inside ./db)
try {
  require("./db");
} catch (e) {
  console.warn("DB init warning:", e?.message || e);
}

const authRoutes = require("./routes/auth");
const alertRoutes = require("./routes/alert");
const webhookRoutes = require("./routes/webhook");
const testRoutes = require("./routes/test");

const app = express();

/* ---------- Core middleware ---------- */
app.set("trust proxy", 1); // required for secure cookies on Render

app.use(cors());
app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: "1mb" }));

const SESSION_SECRET = process.env.SESSION_SECRET || "dev-only-secret";
app.use(
  session({
    name: "sid",
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: true,     // Render is HTTPS
      httpOnly: true,
      sameSite: "none", // required for Shopify embedded/admin -> your app
      maxAge: 30 * 24 * 60 * 60 * 1000,
    },
  })
);

/* ---------- Simple index + health ---------- */
app.get("/", (_req, res) => {
  res.type("html").send(`
    <h1>Back In Stock App</h1>
    <ul>
      <li><code>GET /health</code></li>
      <li><code>GET /auth?shop=your-store.myshopify.com</code></li>
      <li><code>GET /auth/token/check?shop=your-store.myshopify.com</code></li>
    </ul>
  `);
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    env: {
      HOST: !!process.env.HOST,
      MONGODB_URI: !!process.env.MONGODB_URI,
      SHOPIFY_API_KEY: !!process.env.SHOPIFY_API_KEY,
      SHOPIFY_API_SECRET: !!process.env.SHOPIFY_API_SECRET,
      SESSION_SECRET: !!process.env.SESSION_SECRET,
    },
    ts: new Date().toISOString(),
  });
});

/* ---------- Mount routes under explicit bases ---------- */
app.use("/auth", authRoutes);
app.use("/alerts", alertRoutes);
app.use("/webhook", webhookRoutes);
app.use("/test", testRoutes);

/* ---------- Error middleware (keeps process alive) ---------- */
app.use((err, _req, res, _next) => {
  console.error("Express error handler:", err?.stack || err);
  res.status(500).json({ ok: false, error: "server_error" });
});

/* ---------- Global crash guards ---------- */
process.on("unhandledRejection", (reason, p) => {
  console.error("Unhandled Rejection at:", p, "reason:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

/* ---------- Start ---------- */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`==> Server started at http://localhost:${PORT}`);
  console.log(`==> Available at your primary URL`, process.env.HOST || "(set HOST)");
});

module.exports = app;
