const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// --- DB Setup ---
const db = mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
global.dbReady = db.then(() => console.log("✅ Connected to MongoDB")).catch(err => {
  console.error("❌ MongoDB connection error:", err);
});

// --- Middleware ---
app.use(express.json());

// --- Serve Static Files (HTML, CSS, etc.) ---
app.use(express.static(path.join(__dirname, "public")));

// --- Routes ---
app.use("/auth", require("./routes/auth"));
app.use("/alerts", require("./routes/alert"));
app.use("/webhook", require("./routes/webhook"));
app.use("/test", require("./routes/test"));
app.use("/theme", require("./routes/theme"));
app.use("/uninstall", require("./routes/uninstall"));

// --- Root Route Redirect to Settings Page ---
app.get("/", (req, res) => {
  res.redirect("/settings.html");
});

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
