// server.js
const express = require("express");
const session = require("express-session");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config();

const app = express();

// ───────────────────────────────────────────────────────────────────────────────
// Basic app/security setup
// ───────────────────────────────────────────────────────────────────────────────
app.set("trust proxy", 1);
app.use(cors({ origin: true, credentials: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "bisw-secret",
    resave: false,
    saveUninitialized: true,
    cookie: { sameSite: "lax", secure: false }, // set secure:true if forcing https via proxy
  })
);

// ───────────────────────────────────────────────────────────────────────────────
// Mount the webhook BEFORE any global JSON parser (webhook uses express.raw)
// ───────────────────────────────────────────────────────────────────────────────
app.use("/webhook", require("./routes/webhook"));

// ───────────────────────────────────────────────────────────────────────────────
// Now it's safe to enable JSON/body parsing for normal routes
// ───────────────────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ───────────────────────────────────────────────────────────────────────────────
// DB (MongoDB)
// ───────────────────────────────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI || "";
if (!MONGO_URI) {
  console.warn("⚠️  MONGO_URI is not set. The app will run but DB ops will fail.");
} else {
  mongoose
    .connect(MONGO_URI, { maxPoolSize: 10 })
    .then(() => console.log("✅ MongoDB connected"))
    .catch((err) => {
      console.error("❌ MongoDB connection error:", err.message || err);
    });
}

// ───────────────────────────────────────────────────────────────────────────────
// Routes
// ───────────────────────────────────────────────────────────────────────────────
app.get("/", (_req, res) => res.send("Back-in-stock app up ✅"));
app.get("/health", (_req, res) =>
  res.json({ ok: true, uptime: process.uptime(), env: process.env.NODE_ENV || "development" })
);

// normal app routes (these rely on JSON parser)
app.use("/auth", require("./routes/auth"));
app.use("/alerts", require("./routes/alert"));
app.use("/test", require("./routes/test"));

// (optional) serve static if you drop any public assets
app.use("/public", express.static(path.join(__dirname, "public")));

// ───────────────────────────────────────────────────────────────────────────────
// Error handling
// ───────────────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Not found" });
});

app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ ok: false, error: "Server error" });
});

// ───────────────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server started at http://localhost:${PORT}`);
});
