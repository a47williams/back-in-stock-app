// server.js
const express = require("express");
const mongoose = require("mongoose");
const morgan = require("morgan");
const cors = require("cors");
const path = require("path");

require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to DB (loads db.js, which runs mongoose.connect)
require("./db");

// Middleware
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

// Serve static files from "public" directory
app.use(express.static(path.join(__dirname, "public")));

// Routes
app.use("/alerts", require("./routes/alert"));
app.use("/auth", require("./routes/auth"));
app.use("/uninstall", require("./routes/uninstall"));
app.use("/webhook", require("./routes/webhook"));

// Fallback route
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Not found", path: req.path });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
// If the root route is hit, redirect to the settings page
app.get("/", (req, res) => {
  res.redirect("/settings.html");
});
