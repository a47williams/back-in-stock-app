// server.js
const express = require("express");
const session = require("express-session");
const mongoose = require("mongoose");
const MongoStore = require("connect-mongo");
const morgan = require("morgan");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");

// Load env variables
dotenv.config();

// MongoDB Connection
mongoose.set("strictQuery", true); // Suppress Mongoose warning
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

// Persistent session using MongoDB
app.use(
  session({
    secret: process.env.SESSION_SECRET || "secret",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      collectionName: "sessions",
    }),
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, // 1 day
    },
  })
);

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// Routes
app.use("/auth", require("./routes/auth"));
app.use("/alert", require("./routes/alert"));
app.use("/theme", require("./routes/theme"));
app.use("/webhook", require("./routes/webhook"));
app.use("/uninstall", require("./routes/uninstall"));

app.get("/", (req, res) => {
  res.send("🟢 Back in Stock App is running");
});

app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
