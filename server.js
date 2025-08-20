// server.js
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const dotenv = require('dotenv');
const path = require('path');
const authRoutes = require('./routes/auth');
const alertRoutes = require('./routes/alert');
const webhookRoutes = require('./routes/webhook');
const uninstallRoutes = require('./routes/uninstall');
const snippetWidgetRoutes = require('./routes/snippetWidget');

dotenv.config();

const app = express();

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Session setup
app.use(
  session({
    secret: process.env.SHOPIFY_API_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI
    })
  })
);

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Routes
app.use('/auth', authRoutes);
app.use('/alert', alertRoutes);
app.use('/webhook', webhookRoutes);
app.use('/uninstall', uninstallRoutes);
app.use('/', snippetWidgetRoutes);

// Fallback route for browser-based access
app.get('/', (req, res) => {
  res.send(`
    <h1>Back In Stock Alerts App</h1>
    <p>If you're seeing this, the app is running but accessed directly. Please use the Shopify interface to interact with the app.</p>
  `);
});

// Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
