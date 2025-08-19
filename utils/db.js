// utils/db.js
const mongoose = require("mongoose");

let ready = false;
let connecting = null;

function log(msg, extra = {}) {
  const out = { at: "db", msg, ...extra };
  console.log(JSON.stringify(out));
}

async function connectToDB(uri) {
  if (ready) return mongoose.connection;
  if (connecting) return connecting;

  if (!uri) {
    throw new Error("MONGO_URI missing");
  }

  // Fail fast instead of silently buffering
  mongoose.set("bufferCommands", false);

  // Helpful strictQuery default
  mongoose.set("strictQuery", true);

  const opts = {
    serverSelectionTimeoutMS: 12000, // quicker fail if Atlas blocked/typo
    socketTimeoutMS: 20000,
    maxPoolSize: 5,
    minPoolSize: 0,
    // KeepAlive so free Render doesn’t drop easily
    keepAlive: true,
    keepAliveInitialDelay: 300000,
  };

  connecting = mongoose
    .connect(uri, opts)
    .then(() => {
      ready = true;
      log("MongoDB connected", { host: mongoose.connection.host });
      return mongoose.connection;
    })
    .catch((err) => {
      ready = false;
      connecting = null;
      log("MongoDB connect error", { error: err.message });
      throw err;
    });

  // Connection lifecycle logs
  mongoose.connection.on("error", (err) => {
    ready = false;
    log("Mongo error", { error: err.message });
  });
  mongoose.connection.on("disconnected", () => {
    ready = false;
    log("Mongo disconnected");
  });
  mongoose.connection.on("reconnected", () => {
    ready = true;
    log("Mongo reconnected");
  });

  return connecting;
}

function isDBReady() {
  return ready;
}

module.exports = { connectToDB, isDBReady };
