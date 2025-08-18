// server.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();

// CORS + JSON
app.use(cors({ origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// DB
const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
  console.warn('⚠️  Missing MONGO_URI');
}
mongoose
  .connect(mongoUri || '', {})
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ Mongo error:', err.message));

// Routes
const alertRoutes = require('./routes/alert');
const webhookRoutes = require('./routes/webhook');
const testRoutes = require('./routes/test'); // NEW

app.use('/alerts', alertRoutes);
app.use('/webhook', webhookRoutes);
app.use('/test', testRoutes); // NEW

// Health endpoints
app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/', (_req, res) => res.send('✅ App running'));

// Start
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
