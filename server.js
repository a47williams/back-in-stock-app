// server.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config();

const app = express();

// -------- CORS (allow storefront + Shopify) --------
app.use(cors({ origin: true }));

// -------- Body parser switch: RAW for /webhook, JSON for everything else --------
app.use((req, res, next) => {
  if (req.path.startsWith('/webhook')) {
    // Shopify requires the exact raw bytes for HMAC verification
    return express.raw({ type: 'application/json' })(req, res, next);
  }
  return express.json()(req, res, next);
});

// -------- Routes --------
const webhookRoutes = require('./routes/webhook'); // expects raw body
app.use('/webhook', webhookRoutes);

const alertRoutes = require('./routes/alert');     // normal JSON
const authRoutes  = require('./routes/auth');      // normal JSON
app.use('/alerts', alertRoutes);
app.use('/auth', authRoutes);

// Health & root
app.get('/', (_req, res) => res.send('✅ App running!'));
app.get('/health', (_req, res) => res.json({ ok: true }));

// -------- MongoDB --------
async function connectMongo() {
  if (!process.env.MONGO_URI) {
    console.warn('⚠️  MONGO_URI missing; skipping Mongo connect');
    return;
  }
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB connected');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
  }
}
connectMongo();

// -------- Start server --------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server started at http://localhost:${PORT}`);
});
