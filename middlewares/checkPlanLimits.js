// middlewares/checkPlanLimits.js

const planLimits = {
  basic: 100,
  pro: 500,
  custom: Infinity
};

const { sendLimitReachedEmail } = require("../utils/sendEmail");

module.exports = async (req, res, next) => {
  const shop = req.shop;

  if (!shop) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const now = new Date();

  // 🧪 Trial check
  if (shop.plan === "free") {
    if (shop.trialEndsAt && now > shop.trialEndsAt) {
      if (!shop.alertLimitReached) {
        shop.alertLimitReached = true;
        await shop.save();
        sendLimitReachedEmail(shop);
      }
      return res.status(204).send(); // No Content
    }
  }

  // 💳 Plan limit check
  const limit = planLimits[shop.plan] || 0;

  if (shop.alertsUsedThisMonth >= limit) {
    if (!shop.alertLimitReached) {
      shop.alertLimitReached = true;
      await shop.save();
      sendLimitReachedEmail(shop);
    }
    return res.status(204).send(); // No Content
  }

  // 🚀 Continue normally
  next();
};
