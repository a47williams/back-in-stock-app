const mongoose = require("mongoose");

const ShopSchema = new mongoose.Schema(
  {
    shop: { type: String, required: true, unique: true },
    accessToken: { type: String },

    // 🔄 Updated plan enums
    plan: {
      type: String,
      enum: ["starter", "micro", "growth", "scale", "custom"],
      default: "starter"
    },
    trialStartDate: { type: Date },
    trialEndsAt: { type: Date },

    alertsUsedThisMonth: { type: Number, default: 0 },
    alertLimitReached: { type: Boolean, default: false }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Shop", ShopSchema);
