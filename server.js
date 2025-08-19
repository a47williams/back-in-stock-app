// server.js
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const cors = require('cors');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const app = express();

/* ---------- Boot diagnostics (shows up in Render logs) ---------- */
try {
  console.log('CWD:', process.cwd());
  const routesDir = path.join(process.cwd(), 'routes');
  if (fs.existsSync(routesDir)) {
    console.log('Routes dir listing:', fs.readdirSync(routesDir));
  } else {
    console.log('No routes directory found at', routesDir);
  }
} catch (e) {
  console.log('Boot debug listing failed:', e.message);
}

/* ---------- Trust proxy for Render ---------- */
app.set('trust proxy', 1);

/* ---------- Basic CORS (adjust if you lock down domains) ---------- */
const allowedOrigins = [
  /\.myshopify\.com$/,
  process.env.HOST, // e.g. https://back-in-stock-app.onrender.com
].filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // allow server-to-server/tools
      if (allowedOrigins.some((o) => (o instanceof RegExp ? o.test(origin) : o === origin))) {
        return cb(null, true);
      }
      return cb(null, false);
    },
    credentials: true,
  })
);

/* ---------- Sessions (used by Shopify OAuth, optional) ---------- */
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-session-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: true,      // Render is HTTPS; keep true
      sameSite: 'none',  // for Shopify iframe/install flows
    },
  })
);

/* ---------- MongoDB ---------- */
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('❌ MONGO_URI missing in environment.');
} else {
  mongoose
    .connect(MONGO_URI, { dbName: process.env.MONGO_DB || undefined })
    .then(() => console.log('✅ MongoDB connected'))
    .catch((err) => console.error('❌ MongoDB connection error:', err.message));
}

/* ---------- Health endpoints (no auth) ---------- */
app.get('/', (_req, res) => res.send('Back In Stock app is running.'));
app.get('/health', (_req, res) => {
  const mongoState = mongoose.connection?.readyState; // 0=disconnected 1=connected 2=connecting 3=disconnecting
  res.json({
    ok: true,
    env: process.env.NODE_ENV || 'development',
    mongo: mongoState,
    time: new Date().toISOString(),
  });
});

/* ---------- Mount routes ---------- */
/**
 * IMPORTANT: keep the webhook router mounted BEFORE any global JSON parser
 * if your webhook route expects a raw body for HMAC verification.
 * (Our webhook router should use express.raw itself, but this order is still safe.)
 */
try {
  const webhookRouter = require('./routes/webhook'); // must be ./routes/webhook.js (lowercase)
  app.use('/webhook', webhookRouter);
  console.log('Mounted /webhook');
} catch (e) {
  console.error('⚠️ Could not mount /webhook:', e.message);
}

/* JSON/body parsing for the rest of the app */
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

try {
  const authRouter = require('./routes/auth'); // lowercase filename
  app.use('/auth', authRouter);
  console.log('Mounted /auth');
} catch (e) {
  console.error('⚠️ Could not mount /auth:', e.message);
}

try {
  const alertRouter = require('./routes/alert'); // lowercase filename
  app.use('/alerts', alertRouter);
  console.log('Mounted /alerts');
} catch (e) {
  console.error('⚠️ Could not mount /alerts:', e.message);
}

try {
  // Optional test endpoints if you keep a routes/test.js
  const testRouter = require('./routes/test');
  app.use('/test', testRouter);
  console.log('Mounted /test');
} catch (e) {
  console.warn('ℹ️ /test routes not found (this is fine in production).');
}

/* ---------- 404 & Error handlers ---------- */
app.use((req, res, next) => {
  res.status(404).json({ ok: false, error: 'Not Found', path: req.originalUrl });
});

app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ ok: false, error: err.message || 'Internal Server Error' });
});

/* ---------- Start server (Render requires process.env.PORT) ---------- */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server started at http://localhost:${PORT}`);
});
