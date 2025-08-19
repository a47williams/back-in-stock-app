// routes/auth.js
const express = require("express");
const router = express.Router();
const Shop = require("../models/Shop");
const { beginOAuth, completeOAuth } = require("../utils/shopifyApi");

// GET /auth?shop=your-store.myshopify.com
router.get("/", async (req, res) => {
  try {
    const { shop } = req.query;
    if (!shop) return res.status(400).send("Missing shop param");
    const url = beginOAuth(shop);
    return res.redirect(url);
  } catch (e) {
    console.error("auth start error", e);
    res.status(500).send("Auth error");
  }
});

// GET /auth/callback
router.get("/callback", async (req, res) => {
  try {
    const { shop, accessToken } = await completeOAuth(req);
    await Shop.findOneAndUpdate(
      { shop },
      { $set: { shop, accessToken } },
      { upsert: true }
    );
    res.send("✅ App installed. You can close this window.");
  } catch (e) {
    console.error("auth callback error", e);
    res.status(500).send("Auth callback error");
  }
});

module.exports = router;
