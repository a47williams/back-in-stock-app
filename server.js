// server.js
require("dotenv").config();

const express = require("express");
const session = require("express-session");
const cors = require("cors");
const morgan = require("morgan");
const path = require("path");

// --- Routes
const authRoutes    = require("./routes/auth");
const alertRoutes   = require("./routes/alert");
const webhookRoutes = require("./routes/webhook");
const testRoutes    = require("./routes/test");

const app = express();

// ---------- basic middleware
app.use(morgan("dev"));
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// NOTE: MemoryStore is fine for dev; for prod use a durable store.
app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { sameSite: "lax" },
  })
);

// ---------- root page (tiny helper)
app.get("/", (_req, res) => {
  res.type("html").send(`
    <body style="font-family:system-ui;line-height:1.4;padding:24px">
      <h2>Back‑in‑Stock App</h2>
      <ul>
        <li><code>GET /health</code></li>
        <li><code>GET /alerts/debug/list</code></li>
        <li><code>GET /auth?shop=your-store.myshopify.com</code></li>
      </ul>
    </body>
  `);
});

// ---------- health
app.get("/health", (_req, res) => res.json({ ok: true }));

// ---------- routes (THIS ORDER MATTERS)
app.use("/auth",   authRoutes);      // ✅ mount auth at /auth
app.use("/alerts", alertRoutes);     // ✅ correct variable name
app.use("/webhook", webhookRoutes);
app.use("/test",    testRoutes);

// ---------- start
const PORT = Number(process.env.PORT) || 10000;
app.listen(PORT, () => {
  console.log(`==> Server started at http://localhost:${PORT}`);
  console.log("==> Available at your primary URL", process.env.HOST);
});

module.exports = app;
