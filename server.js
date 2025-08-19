const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');
const alertRoutes = require('./routes/alert');
const authRoutes = require('./routes/auth');
const webhookRoutes = require('./routes/webhook');
const themeRoutes = require('./routes/theme');
const uninstallRoutes = require('./routes/uninstall');
const testRoutes = require('./routes/test');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB connected'))
.catch((err) => console.error('❌ MongoDB connection error:', err));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/alerts', alertRoutes);
app.use('/auth', authRoutes);
app.use('/webhook', webhookRoutes);
app.use('/theme', themeRoutes);
app.use('/uninstall', uninstallRoutes);
app.use('/test', testRoutes);

// Default route
app.get('/', (req, res) => {
  res.status(404).json({ ok: false, error: 'Not found', path: req.path });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
