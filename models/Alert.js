// models/Alert.js
const mongoose = require("mongoose");

const AlertSchema = new mongoose.Schema(
  {
    shop: {
      type: String,
      required: true, // store's myshopify domain, e.g. back-in-stock-alerts-app.myshopify.com
      index: true,
      lowercase: true,
      trim: true,
    },
    productId: {
      type: String,
      required: true, // Shopify product id (stringified)
      index: true,
      trim: true,
    },
    variantId: {
      type: String,
      required: true, // Shopify variant id (stringified)
      index: true,
      trim: true,
    },
    // Optional: if you ever store it (not required in the variantId-only flow)
    inventory_item_id: {
      type: String,
      index: true,
      sparse: true,
      trim: true,
    },
    phone: {
      type: String, // E.164 phone, with or without 'whatsapp:' prefix on save
      required: true,
      index: true,
      trim: true,
    },
    sent: {
      type: Boolean,
      default: false,
      index: true,
    },
    sentAt: {
      type: Date,
    },
    lastSid: {
      type: String, // last Twilio SID we sent (for debugging)
      index: true,
      sparse: true,
      trim: true,
    },
  },
  {
    timestamps: true, // adds createdAt, updatedAt
    minimize: true,
  }
);

/**
 * Unique guard to prevent duplicate signups for the same (shop, product, variant, phone).
 * 'sparse' allows partial docs if you ever store test rows without all fields (not recommended).
 */
AlertSchema.index(
  { shop: 1, productId: 1, variantId: 1, phone: 1 },
  { unique: true, sparse: true, name: "uniq_shop_product_variant_phone" }
);

/**
 * Helpful index for webhook lookups: find all unsent alerts for a given shop+variant quickly.
 */
AlertSchema.index(
  { shop: 1, variantId: 1, sent: 1, createdAt: -1 },
  { name: "shop_variant_sent_created_idx" }
);

/**
 * (Optional) If you ever notify by inventory_item_id, this speeds up that path.
 */
AlertSchema.index(
  { shop: 1, inventory_item_id: 1, sent: 1 },
  { name: "shop_inventoryItem_sent_idx", sparse: true }
);

module.exports = mongoose.models.Alert || mongoose.model("Alert", AlertSchema);
