// models/Shop.js
const mongoose = require('mongoose');

const ShopSchema = new mongoose.Schema({
  shop: { type: String, unique: true, required: true },   // e.g. my-store.myshopify.com
  accessToken: { type: String, required: true },          // Admin API token
}, { timestamps: true });

module.exports = mongoose.model('Shop', ShopSchema);
