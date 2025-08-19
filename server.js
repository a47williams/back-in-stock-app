// server.js
require("dotenv").config();

const express = require("express");
const session = require("express-session");
const cors = require("cors");
const path = require("path");

const app = express();

// ---------- CORS (storefront -> Render) ----------
const allowList = [
  /\.myshopify\.com$/i,
  /\.shopify\.com$/i,
];
if (process.env.HOST) {
  try {
    const host = new URL(process.env.HOST).hostname;
    if (host) allowList.push(new RegExp(host.replace(/\./g, "\\.") + "$", "i"));
  } catch (_) {}
}
app.use((req, res, next) => {
  const origin = req.headers.origin || "";
  const ok = !origin || allowList.some((re) => re.test(origin));
  if (ok) {
    res.header("Access-Control-Allow-Origin", origin || "*");
    res.header("Vary", "Origin");
    res.header("Access-Control-Allow-Headers", "Content-Type, X-Requested-With");
    res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ---------- Body parsing ----------
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// ---------- Session (used for OAuth flows) ----------
app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-secret",
    resave: false,
    saveUninitialized: false,
  })
);

// ---------- Health ----------
app.get("/health", (_req, res) => res.json({ ok: true }));

// ---------- Routes ----------
app.use("/alerts", require("./routes/alert"));
app.use("/webhook", require("./routes/webhook"));
app.use("/test", require("./routes/test"));

// ---------- Start ----------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("Server started at http://localhost:" + PORT);
  console.log("MongoDB connected (assumed earlier).");
  console.log("Your service is live 🎉");
});

module.exports = app;
