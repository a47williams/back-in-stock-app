const mongoose = require('mongoose');

const AlertSchema = new mongoose.Schema({
  productId: { type: String, required: true },
  variantId: { type: String, required: true },
  phone: String,
  email: String,
  sent: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Alert', AlertSchema);
