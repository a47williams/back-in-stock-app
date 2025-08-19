// server.js
const express = require("express");
const cors = require("cors");
const session = require("express-session");
const dotenv = require("dotenv");
dotenv.config();

const { connectToDB, isDBReady } = require("./utils/db");

const authRoutes = require("./routes/auth");
const alertRoutes = require("./routes/alert");
const webhookRoutes = require("./routes/webhook");
const testRoutes = require("./routes/test");

const PORT = process.env.PORT || 10000;
const HOST = process.env.HOST || "";
const MONGO_URI = process.env.MONGO_URI;

const app = express();

// CORS – allow your shop + preview
app.use(
  cors({
    origin: [/\.myshopify\.com$/, /onrender\.com$/],
    credentials: false,
  })
);

// Basic body parsing (webhook route uses raw body itself)
app.use(express.json());

// Sessions (fine for MVP)
app.use(
  session({
    secret: process.env.SESSION_SECRET || "bisw_dev",
    resave: false,
    saveUninitialized: false,
    cookie: { sameSite: "lax", secure: false },
  })
);

// Health before DB
app.get("/health", (req, res) => {
  res.json({ ok: true, db: isDBReady() ? "up" : "down", host: HOST || null });
});

// Block requests that need DB while not ready (except health & webhook raw parsing)
app.use((req, res, next) => {
  const allow = ["/health", "/webhook/inventory", "/test/whatsapp", "/test/whatsapp/status"];
  if (allow.some((p) => req.path.startsWith(p))) return next();
  if (!isDBReady()) return res.status(503).json({ error: "DB not ready" });
  next();
});

// Routes
app.use("/auth", authRoutes);
app.use("/alerts", alertRoutes);
app.use("/webhook", webhookRoutes);
app.use("/test", testRoutes);

// Boot
(async () => {
  try {
    await connectToDB(MONGO_URI);
    app.listen(PORT, () => {
      console.log("Server started", { port: PORT });
      console.log("Primary URL", HOST || "(unset)");
    });
  } catch (err) {
    console.error("Fatal: DB connect failed", err.message);
    // Keep server up for /health but show 503 for others
    app.listen(PORT, () => {
      console.log("Server started in degraded mode", { port: PORT });
    });
  }
})();
