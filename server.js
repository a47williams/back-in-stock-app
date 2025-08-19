// server.js
require("dotenv").config();

const express = require("express");
const session = require("express-session");
const cors = require("cors");
const path = require("path");

// DB connect (your existing db init, if you have one)
require("./db"); // no-op if you already connect elsewhere

const authRoutes = require("./routes/auth");
const alertRoutes = require("./routes/alert");
const webhookRoutes = require("./routes/webhook");
const testRoutes = require("./routes/test");

const app = express();

/* ---------- core middleware ---------- */
app.set("trust proxy", 1); // needed on Render for secure cookies

app.use(cors());
app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: "1mb" }));

if (!process.env.SESSION_SECRET) {
  console.warn("⚠️ SESSION_SECRET is not set. Set it in Render -> Environment.");
}
app.use(
  session({
    name: "sid",
    secret: process.env.SESSION_SECRET || "dev-only-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: true,        // Render uses HTTPS
      httpOnly: true,
      sameSite: "none",    // allow cross-site (Shopify admin -> your app)
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    },
  })
);

/* ---------- routes ---------- */

// simple index so you can see what’s mounted
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

// health
app.get("/health", (_req, res) => res.json({ ok: true }));

// mount under explicit bases (no conflicts)
app.use("/auth", authRoutes);
app.use("/alerts", alertRoutes);
app.use("/webhook", webhookRoutes);
app.use("/test", testRoutes);

/* ---------- start ---------- */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`==> Server started at http://localhost:${PORT}`);
  console.log(`==> Available at your primary URL`, process.env.HOST || "(set HOST)");
});

module.exports = app;
