const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');
const cors = require('cors');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

mongoose.set('strictQuery', false); // Suppress warning

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ✅ Persistent session store
app.use(session({
  secret: process.env.SESSION_SECRET || 'keyboard cat',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    ttl: 14 * 24 * 60 * 60,
  }),
}));

mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB connection error:', err));

app.use(express.static(path.join(__dirname, 'public')));

app.use('/auth', require('./routes/auth'));
app.use('/alert', require('./routes/alert'));
app.use('/theme', require('./routes/theme'));
app.use('/webhook', require('./routes/webhook'));
app.use('/uninstall', require('./routes/uninstall'));

app.get('/', (req, res) => {
  res.json({ ok: false, error: 'Not found', path: req.path });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
