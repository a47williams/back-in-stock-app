const mongoose = require("mongoose");

const ShopSchema = new mongoose.Schema(
  {
    shop: { type: String, required: true, unique: true },
    accessToken: { type: String },

    // ➕ New fields for billing/limits
    plan: {
      type: String,
      enum: ["free", "basic", "pro", "custom"],
      default: "free"
    },
    trialStartDate: { type: Date },
    trialEndsAt: { type: Date },
    alertsUsedThisMonth: { type: Number, default: 0 },
    alertLimitReached: { type: Boolean, default: false }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Shop", ShopSchema);
