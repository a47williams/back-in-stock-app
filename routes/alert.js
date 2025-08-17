const express = require('express');
const router = express.Router();
const Alert = require('../models/Alert');

// Save alert request (e.g. customer clicks "Notify Me")
router.post('/register', async (req, res) => {
  const { productId, variantId, phone, email } = req.body;

  if (!productId || !variantId || (!phone && !email)) {
    return res.status(400).json({ error: 'Missing data' });
  }

  try {
    const alert = new Alert({ productId, variantId, phone, email });
    await alert.save();
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Failed to save alert:', err);
    res.status(500).json({ error: 'Failed to register alert' });
  }
});

module.exports = router;
