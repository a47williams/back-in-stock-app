const express = require("express");
const router = express.Router();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const priceMap = {
  micro: process.env.STRIPE_PRICE_MICRO,
  growth: process.env.STRIPE_PRICE_GROWTH,
  scale: process.env.STRIPE_PRICE_SCALE,
  custom: process.env.STRIPE_PRICE_CUSTOM
};

router.post("/create-session", async (req, res) => {
  const { plan, shop } = req.body;
  const priceId = priceMap[plan];
  if (!priceId) return res.status(400).json({ ok: false, error: "Invalid plan" });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { plan, shop },
      success_url: `${req.headers.origin}/settings?success=1`,
      cancel_url: `${req.headers.origin}/settings?canceled=1`
    });
    return res.json({ ok: true, sessionId: session.id });
  } catch (err) {
    console.error("Stripe session error:", err);
    return res.status(500).json({ ok: false, error: "stripe_error" });
  }
});

module.exports = router;
