// server.js
require("dotenv").config();

const express = require("express");
const session = require("express-session");
const cors = require("cors");
const mongoose = require("mongoose");

const authRoutes = require("./routes/auth");
const alertRoutes = require("./routes/alert");     // <-- singular
const webhookRoutes = require("./routes/webhook");
const testRoutes = require("./routes/test");       // keep if you have it; harmless if mounted

const app = express();

/** ---------- DB ---------- */
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("❌ MONGO_URI env var is missing");
  process.exit(1);
}
mongoose.set("strictQuery", true);
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((e) => {
    console.error("❌ MongoDB connect error", e);
    process.exit(1);
  });

/** ---------- Middleware ---------- */
app.use(cors());
app.use(express.json({ limit: "1mb" })); // general JSON parsing
app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-secret",
    resave: false,
    saveUninitialized: true,
  })
);

/** ---------- Root helper ---------- */
app.get("/", (_req, res) => {
  res.type("html").send(`
  <html><body style="font-family:system-ui; line-height:1.4">
    <h2>Back-in-Stock App</h2>
    <ul>
      <li><code>GET /health</code></li>
      <li><code>GET /alerts/debug/list</code></li>
      <li><code>GET /auth?shop=your-store.myshopify.com</code></li>
    </ul>
  </body></html>
  `);
});

/** ---------- Health ---------- */
app.get("/health", (_req, res) => res.json({ ok: true }));

/** ---------- Routes ---------- */
app.use("/auth", authRoutes);
app.use("/alerts", alertRoutes);
app.use("/webhook", webhookRoutes);
app.use("/test", testRoutes);

/** ---------- Start ---------- */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server started at http://localhost:${PORT}`);
  console.log(`==> Available at your primary URL ${process.env.HOST || ""}`);
});
