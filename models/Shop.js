// models/Shop.js
const mongoose = require("mongoose");

const ShopSchema = new mongoose.Schema(
  {
    shop: { type: String, required: true, unique: true },
    accessToken: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Shop", ShopSchema);
