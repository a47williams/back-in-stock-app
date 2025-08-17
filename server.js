// back-in-stock-app/server.js

// Load env first
require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const cors = require('cors');
const path = require('path');

// Routes
const authRoutes = require('./routes/auth');
const alertRoutes = require('./routes/alert');
const webhookRoutes = require('./routes/webhook');
const testRoutes = require('./routes/test'); // optional: manual WhatsApp test

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * CORS (so your storefront can POST to /alerts/register)
 */
app.use(cors({ origin: true }));

/**
 * IMPORTANT:
 * - Shopify webhooks require HMAC verification on the RAW body.
 * - Mount raw body parser ONLY for /webhook before JSON parser.
 */
app.use('/webhook', express.raw({ type: 'application/json' }));

/**
 * Normal JSON for everything else
 */
app.use(express.json());

/**
 * Sessions + static + (optional) views
 */
app.use(session({ secret: 'keyboardcat', resave: false, saveUninitialized: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

/**
 * MongoDB
 */
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch((err) => console.error('MongoDB error', err));

/**
 * Routes
 */
app.use('/auth', authRoutes);
app.use('/alerts', alertRoutes);
app.use('/webhook', webhookRoutes);
app.use('/test', testRoutes); // optional

/**
 * Health routes
 */
app.get('/', (_req, res) => res.send('✅ App running!'));
app.get('/health', (_req, res) => res.json({ ok: true }));

/**
 * Start server
 */
app.listen(PORT, () => {
  console.log(`Server started at http://localhost:${PORT}`);
});
