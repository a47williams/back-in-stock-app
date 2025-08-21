const express = require("express");
const router = express.Router();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const priceMap = {
  micro: process.env.STRIPE_PRICE_MICRO,
  growth: process.env.STRIPE_PRICE_GROWTH,
  scale: process.env.STRIPE_PRICE_SCALE,
  custom: process.env.STRIPE_PRICE_CUSTOM
};

// 🟢 GET route for browser-based access
router.get("/", async (req, res) => {
  const { plan, shop } = req.query;

  console.log("🔍 Incoming /checkout GET");
  console.log("🧾 Plan:", plan);
  console.log("🏬 Shop:", shop);
  console.log("📦 priceMap:", priceMap);
  console.log("🎯 Selected priceId:", priceMap[plan]);

  if (!plan || !shop) {
    return res.status(400).send("Missing plan or shop");
  }

  const priceId = priceMap[plan];
  if (!priceId) return res.status(400).send("Invalid plan selected");

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { plan, shop },
      success_url: `${process.env.HOST}/settings?success=1`,
      cancel_url: `${process.env.HOST}/settings?canceled=1`
    });

    return res.redirect(303, session.url); // Stripe-hosted checkout
  } catch (err) {
    console.error("❌ Stripe GET session error:", err.message);
    return res.status(500).send("Stripe error");
  }
});

// 🔁 POST route for API use
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
