// models/Subscriber.js
const mongoose = require("mongoose");

const SubscriberSchema = new mongoose.Schema(
  {
    shop: { type: String, required: true, index: true },

    // subscriber’s WhatsApp number (E.164)
    phone: { type: String, required: true, index: true },

    // identifiers for matching + debugging
    productId: { type: String, default: null, index: true },
    variantId: { type: String, default: null, index: true },
    inventoryItemId: { type: String, default: null, index: true },

    // optional extras (useful for templates/links)
    productTitle: { type: String, default: null },
    productUrl: { type: String, default: null },

    // lifecycle
    sentAt: { type: Date, default: null }, // when we notified them (if you keep instead of delete)
  },
  { timestamps: true } // adds createdAt / updatedAt
);

// Helpful indexes for fast lookups
SubscriberSchema.index({ shop: 1, inventoryItemId: 1 });
SubscriberSchema.index({ shop: 1, variantId: 1 });
SubscriberSchema.index({ shop: 1, productId: 1 });

// Optional de-dupe: one sub per shop+phone+variant (when variant present),
// otherwise per shop+phone+product. Comment out if you prefer no unique constraint.
//// SubscriberSchema.index(
////   { shop: 1, phone: 1, variantId: 1 },
////   { unique: true, partialFilterExpression: { variantId: { $type: "string" } } }
//// );
//// SubscriberSchema.index(
////   { shop: 1, phone: 1, productId: 1 },
////   { unique: true, partialFilterExpression: { variantId: { $exists: false } } }
//// );

module.exports = mongoose.models.Subscriber || mongoose.model("Subscriber", SubscriberSchema);
