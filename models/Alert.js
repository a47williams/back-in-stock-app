// models/Alert.js
const mongoose = require('mongoose');

const AlertSchema = new mongoose.Schema({
  shop: { type: String, required: true },                 // e.g. my-store.myshopify.com
  productId: { type: String, required: true },
  variantId: { type: String, required: true },
  inventory_item_id: { type: String, required: true },    // << key for webhook matching
  phone: { type: String, required: true },
  sent: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Alert', AlertSchema);
