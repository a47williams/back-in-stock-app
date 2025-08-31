// models/Subscriber.js
const mongoose = require("mongoose");

const SubscriberSchema = new mongoose.Schema(
  {
    shop: { type: String, required: true, index: true },
    phone: { type: String, required: true, index: true },

    productId: { type: String, index: true },
    variantId: { type: String, index: true },
    inventoryItemId: { type: String, index: true },

    // For nicer messages & follow-up link
    productTitle: { type: String, default: null },
    // Store URL; can be encoded or plain – we decode when sending
    productUrl: { type: String, default: null },

    // Two-step flow state
    awaitingReply: { type: Boolean, default: false }, // true after we send the ping template
    templateSentAt: { type: Date, default: null },    // when ping was sent
    lastInboundAt: { type: Date, default: null },     // last user inbound msg timestamp
  },
  { timestamps: true, strict: false } // strict:false prevents schema errors from older rows
);

// Helpful index (not unique: allow multiple variants per phone)
SubscriberSchema.index({ shop: 1, phone: 1, variantId: 1 });

module.exports = mongoose.model("Subscriber", SubscriberSchema);
