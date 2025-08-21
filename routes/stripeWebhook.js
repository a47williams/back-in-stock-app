// routes/stripeWebhook.js
const express = require("express");
const router = express.Router();
const Stripe = require("stripe");
const bodyParser = require("body-parser");
const Shop = require("../models/Shop");

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Stripe requires raw body
router.post(
  "/webhook",
  bodyParser.raw({ type: "application/json" }),
  async (req, res) => {
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
      const { plan, shop } = session.metadata;

      try {
        const updated = await Shop.findOneAndUpdate(
          { shop },
          { plan, alertLimitReached: false },
          { new: true }
        );
        console.log(`✅ Updated plan to ${plan} for ${shop}`);
      } catch (err) {
        console.error("❌ Failed to update plan:", err.message);
      }
    }

    res.status(200).send("Received");
  }
);

module.exports = router;
