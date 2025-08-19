// models/Shop.js
const mongoose = require("mongoose");

const ShopSchema = new mongoose.Schema(
  {
    shop: { type: String, unique: true, index: true },
    accessToken: { type: String, required: true },
    installedAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Shop", ShopSchema);
