// models/Shop.js
const mongoose = require('mongoose');

const ShopSchema = new mongoose.Schema({
  shop: { type: String, required: true, unique: true }, // e.g. my-store.myshopify.com
  accessToken: { type: String, required: true }
}, { timestamps: true });

module.exports = mongoose.model('Shop', ShopSchema);
