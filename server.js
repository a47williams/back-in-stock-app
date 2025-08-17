// server.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config();

const app = express();

// --- CORS early (so Shopify/storefront can call us) ---
app.use(cors({ origin: true }));

// --- WEBHOOKS MUST USE RAW BODY (before any JSON parser) ---
const webhookRoutes = require('./routes/webhook');
app.use('/webhook', express.raw({ type: 'application/json' })); // keep raw for Shopify HMAC
app.use('/webhook', webhookRoutes);

// --- Normal JSON parsing for all other routes AFTER webhook raw ---
app.use(express.json());

// --- App routes (keep these after express.json) ---
const alertRoutes = require('./routes/alert');
const authRoutes  = require('./routes/auth');

app.use('/alerts', alertRoutes);
app.use('/auth', authRoutes);

// --- Health & root ---
app.get('/', (req, res) => res.send('✅ App running!'));
app.get('/health', (req, res) => res.json({ ok: true }));

// --- MongoDB ---
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

// --- Start server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server started at http://localhost:${PORT}`);
});
