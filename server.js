// server.js
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const dotenv = require("dotenv");
const db = require("./db");

// Load env vars
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Mongo connection
db.connect();

// Middleware
app.use(express.json());

// Serve static files (make sure this points to the correct folder)
app.use(express.static(path.join(__dirname, "public")));

// Routes
app.use("/auth", require("./routes/auth"));
app.use("/alerts", require("./routes/alert"));
app.use("/webhook", require("./routes/webhook"));
app.use("/theme", require("./routes/theme"));
app.use("/uninstall", require("./routes/uninstall"));

// Default route
app.get("/", (req, res) => {
  res.send("✅ Back-in-stock app is running.");
});

// Catch-all 404 for unmatched routes
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Not found", path: req.path });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
