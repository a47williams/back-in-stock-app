const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

const app = express();

// --- Connect to MongoDB ---
mongoose
  .connect(process.env.MONGODB_URI, {
    dbName: process.env.DB_NAME || "back-in-stock",
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error", err));

// --- Serve settings.html from public/ folder ---
app.use("/settings", express.static("public"));

// --- Routes ---
app.use("/auth", require("./routes/auth"));
app.use("/uninstall", require("./routes/uninstall"));
app.use("/alerts", require("./routes/alert"));
app.use("/webhook", require("./routes/webhook"));
app.use("/theme", require("./routes/theme"));

// --- Default route (optional) ---
app.get("/", (req, res) => {
  res.send("Back-in-Stock App is running.");
});

// --- Start server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
