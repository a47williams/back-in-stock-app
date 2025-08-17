// back-in-stock-app/routes/test.js
const express = require('express');
const router = express.Router();
const sendWhatsApp = require('../utils/sendWhatsApp');

// GET /test/whatsapp?to=+15551234567&msg=Hello
router.get('/whatsapp', async (req, res) => {
  const to = req.query.to;
  const msg = req.query.msg || 'Test from Back-in-Stock app ✅';
  if (!to) return res.status(400).send('Missing ?to=+E164number');

  const ok = await sendWhatsApp(to, msg);
  return res.status(ok ? 200 : 500).send(ok ? 'Sent' : 'Failed');
});

module.exports = router;
