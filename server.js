const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');
const cors = require('cors');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));

// Routes
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
