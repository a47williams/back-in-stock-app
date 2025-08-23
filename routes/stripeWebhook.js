const express = require("express");
const router = express.Router();
const Stripe = require("stripe");
const bodyParser = require("body-parser");
const Shop = require("../models/Shop");

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Stripe requires raw body for webhook verification
router.post("/webhook", bodyParser.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error("❌ Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const metadata = session.metadata || {};
    const shop = metadata.shop;
    const plan = metadata.plan;

    if (!shop || !plan) {
      console.warn("⚠️ Webhook received but missing metadata:", metadata);
      return res.status(400).send("Missing metadata");
    }

    try {
      const result = await Shop.findOneAndUpdate(
        { shop },
        {
          $set: {
            plan,
            alertLimitReached: false,
            alertsUsedThisMonth: 0,
            planActivatedAt: new Date(),
            trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14-day trial
          }
        },
        { new: true }
      );

      if (!result) {
        console.warn(`⚠️ Webhook: No shop found for ${shop}`);
      } else {
        console.log(`✅ Webhook: Plan set to ${plan} for ${shop}`);
      }
    } catch (err) {
      console.error("❌ Failed to update shop plan from webhook:", err.message);
    }
  }

  res.status(200).send("Received");
});

module.exports = router;
