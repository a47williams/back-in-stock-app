// middlewares/checkPlanLimits.js

const planLimits = {
  micro: 150,
  growth: 100,
  scale: 500,
  custom: Infinity
};

const { sendLimitReachedEmail } = require("../utils/sendEmail");

module.exports = async (req, res, next) => {
  const shop = req.shop;

  if (!shop) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const now = new Date();

  // 🧪 Starter (formerly free) trial check
  if (shop.plan === "starter") {
    if (shop.trialEndsAt && now > shop.trialEndsAt) {
      if (!shop.alertLimitReached) {
        shop.alertLimitReached = true;
        await shop.save();
        sendLimitReachedEmail(shop);
      }
      return res.status(204).send(); // No Content
    }
  }

  // 💳 Plan-based alert limits
  const limit = planLimits[shop.plan] || 0;

  if (shop.alertsUsedThisMonth >= limit) {
    if (!shop.alertLimitReached) {
      shop.alertLimitReached = true;
      await shop.save();
      sendLimitReachedEmail(shop);
    }
    return res.status(204).send(); // No Content
  }

  // ✅ Proceed to route handler
  next();
};
