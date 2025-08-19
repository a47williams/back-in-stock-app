const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const dotenv = require('dotenv');
const path = require('path');
const authRoutes = require('./routes/auth');
const alertRoutes = require('./routes/alert');
const webhookRoutes = require('./routes/webhook');
const uninstallRoutes = require('./routes/uninstall');
const themeRoutes = require('./routes/theme');

dotenv.config();

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI })
  })
);

app.use('/auth', authRoutes);
app.use('/alerts', alertRoutes);
app.use('/webhook', webhookRoutes);
app.use('/uninstall', uninstallRoutes);
app.use('/theme', themeRoutes);

// Serve static files (HTML, JS, CSS) from /public
app.use(express.static(path.join(__dirname, 'public')));

// Catch-all route for undefined paths
app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'Not found', path: req.originalUrl });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
