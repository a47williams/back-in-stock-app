// models/WebhookReceipt.js
const mongoose = require("mongoose");

const WebhookReceiptSchema = new mongoose.Schema(
  {
    webhookId: { type: String, required: true, unique: true },
    topic: String,
    shop: String,
  },
  { timestamps: true }
);

// Optional TTL: auto-prune receipts after 24h
WebhookReceiptSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 });

module.exports = mongoose.models.WebhookReceipt || mongoose.model("WebhookReceipt", WebhookReceiptSchema);
