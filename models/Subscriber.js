// models/Subscriber.js

const mongoose = require("mongoose");

const subscriberSchema = new mongoose.Schema({
  shop: { type: String, required: true },
  productId: { type: String, required: true },
  phone: { type: String, required: true },
  subscribedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Subscriber", subscriberSchema);
