const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");

const Shop = require("../models/Shop");

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// Parse raw body for Stripe
router.post(
  "/webhook",
  bodyParser.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error("⚠️ Stripe webhook error:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle event types
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const metadata = session.metadata || {};
      const shopDomain = metadata.shop;
      const plan = metadata.plan; // e.g. growth, growth_annual

      try {
        if (!shopDomain || !plan) throw new Error("Missing shop or plan");

        await Shop.findOneAndUpdate(
          { shop: shopDomain },
          {
            plan,
            alertLimitReached: false,
            trialEndsAt: null // cancel trial if upgraded
          }
        );

        console.log(`💳 Shop ${shopDomain} upgraded to plan: ${plan}`);
      } catch (err) {
        console.error("🔴 Failed to upgrade plan:", err);
      }
    }

    // Handle failed payment
    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object;
      const customerId = invoice.customer;

      // Optional: find shop by Stripe customer ID and flag for downgrade
    }

    res.status(200).send("Webhook received");
  }
);

module.exports = router;
