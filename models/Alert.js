// models/Alert.js
const mongoose = require("mongoose");

const AlertSchema = new mongoose.Schema(
  {
    shop: { type: String, required: true, index: true },
    productId: { type: String, required: true },
    variantId: { type: String, required: true },
    inventory_item_id: { type: String, required: true, index: true },
    phone: { type: String, required: true },
    sent: { type: Boolean, default: false },
  },
  { timestamps: true }
);

AlertSchema.index({ shop: 1, inventory_item_id: 1, phone: 1 }, { unique: true });

module.exports = mongoose.model("Alert", AlertSchema);
