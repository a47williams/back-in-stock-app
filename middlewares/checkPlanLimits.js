// middlewares/checkPlanLimits.js

const planLimits = {
  basic: 100,
  pro: 500,
  custom: Infinity
};

module.exports = async (req, res, next) => {
  const shop = req.shop; // assumes you've attached shop data earlier

  if (!shop) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const now = new Date();

  // 🧪 Trial expired
  if (shop.plan === "free") {
    if (shop.trialEndsAt && now > shop.trialEndsAt) {
      // Don't return an error to the frontend
      shop.alertLimitReached = true;
      await shop.save();
      return res.status(204).send(); // No Content, silent fail
    }
  }

  // 💳 Paid plan limits
  const limit = planLimits[shop.plan] || 0;

  if (shop.alertsUsedThisMonth >= limit) {
    shop.alertLimitReached = true;
    await shop.save();
    return res.status(204).send(); // No Content, silent fail
  }

  // 🚀 All good, continue
  next();
};
