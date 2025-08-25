const express = require("express");
const router = express.Router();
const Subscriber = require("../models/Subscriber"); // Update if model name is different

router.post("/subscribe", async (req, res) => {
  const { shop, productId, phone } = req.body;

  if (!shop || !productId || !phone) {
    return res.status(400).json({ success: false, message: "Missing fields" });
  }

  try {
    // Save subscription to DB
    await Subscriber.create({
      shop,
      productId,
      phone
    });

    return res.status(200).json({ success: true, message: "Successfully subscribed" });
  } catch (error) {
    console.error("Subscription error:", error);
    return res.status(500).json({ success: false, message: "Server error subscribing" });
  }
});

module.exports = router;
