// server.js
const express = require("express");
const session = require("express-session");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// Basic health check
app.get("/health", (req, res) => res.json({ ok: true, env: process.env.NODE_ENV || "development" }));

// Sessions (fine for dev; for prod use a store)
app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-secret",
    resave: false,
    saveUninitialized: false,
  })
);

// --- Mount your routers ---
app.use("/auth", require("./routes/auth"));
app.use("/alerts", require("./routes/alert"));
app.use("/webhook", require("./routes/webhook"));

// NEW: mount test routes so GET /test/whatsapp/send works
app.use("/test", require("./routes/test"));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server started at http://localhost:${PORT}`);
});
