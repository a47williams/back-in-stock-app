// server.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const session = require('express-session');

const app = express();

// ----- Middleware -----
app.use(cors({
  origin: [/\.myshopify\.com$/, /\.ngrok-free\.app$/, /\.onrender\.com$/, 'http://localhost:3000'],
  credentials: false,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
}));

// ----- DB -----
const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
  console.error('Missing MONGO_URI');
}
mongoose.connect(mongoUri, {})
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ Mongo error', err.message));

// ----- Routes -----
const alertRoutes = require('./routes/alert');
const webhookRoutes = require('./routes/webhook'); // keep if present

app.use('/alerts', alertRoutes);
app.use('/webhook', webhookRoutes);

// health check
app.get('/', (_req, res) => res.send('App running!'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server started at http://localhost:${PORT}`);
});
