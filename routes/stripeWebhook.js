// routes/stripeWebhook.js

const express = require("express");
const router = express.Router();
const Stripe = require("stripe");
const bodyParser = require("body-parser");
const Shop = require("../models/Shop");

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Stripe needs the raw body for webhook signature verification
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
      await Shop.findOneAndUpdate(
        { shop },
        {
          plan,
          alertLimitReached: false,
        }
      );
      console.log(`✅ Updated plan to ${plan} for ${shop}`);
    } catch (err) {
      console.error("❌ Failed to update shop plan from webhook:", err.message);
    }
  }

  res.status(200).send("Received");
});

module.exports = router;
