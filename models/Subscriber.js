// models/Subscriber.js
const mongoose = require("mongoose");

const SubscriberSchema = new mongoose.Schema(
  {
    shop: { type: String, required: true, index: true },
    phone: { type: String, required: true, index: true },

    productId: { type: String, default: null, index: true },
    variantId: { type: String, default: null, index: true },
    inventoryItemId: { type: String, default: null, index: true },

    // optional (handy for WhatsApp template variables)
    productTitle: { type: String, default: null },
    productUrl: { type: String, default: null },

    sentAt: { type: Date, default: null },
  },
  { timestamps: true } // adds createdAt / updatedAt
);

// fast lookups
SubscriberSchema.index({ shop: 1, inventoryItemId: 1 });
SubscriberSchema.index({ shop: 1, variantId: 1 });
SubscriberSchema.index({ shop: 1, productId: 1 });

module.exports =
  mongoose.models.Subscriber || mongoose.model("Subscriber", SubscriberSchema);
