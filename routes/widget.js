// routes/widget.js
const express = require("express");
const router = express.Router();
const Subscriber = require("../models/Subscriber");

router.post("/subscribe", async (req, res) => {
  const { shop, productId, phone } = req.body;
  if (!shop || !productId || !phone) {
    return res.status(400).json({ success: false, message: "Missing fields" });
  }
  try {
    await Subscriber.create({ shop, productId, phone });
    return res.status(200).json({ success: true, message: "Subscribed!" });
  } catch (err) {
    console.error("Error saving subscriber:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;