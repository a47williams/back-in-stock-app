// server.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();

/* ---------- CORS ---------- */
app.use(cors({ origin: true }));

/* ---------- Body parsing ---------- */
/**
 * Use RAW body for /webhook/* so HMAC can be verified on exact bytes,
 * and JSON body for everything else.
 */
app.use((req, res, next) => {
  if (req.path.startsWith('/webhook')) {
    return express.raw({ type: 'application/json' })(req, res, next);
  }
  // normal routes
  return express.json()(req, res, next);
});
app.use(express.urlencoded({ extended: true }));

/* ---------- Mongo ---------- */
const mongoUri = process.env.MONGO_URI;
if (!mongoUri) console.warn('⚠️  Missing MONGO_URI');
mongoose
  .connect(mongoUri || '', {})
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ Mongo error:', err.message));

/* ---------- Routes ---------- */
const alertRoutes = require('./routes/alert');
const webhookRoutes = require('./routes/webhook');
const testRoutes = require('./routes/test');

app.use('/alerts', alertRoutes);
app.use('/webhook', webhookRoutes); // will receive RAW bodies
app.use('/test', testRoutes);

/* ---------- Health ---------- */
app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/', (_req, res) => res.send('✅ App running'));

/* ---------- Start ---------- */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
