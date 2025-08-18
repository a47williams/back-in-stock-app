// routes/test.js
const express = require("express");
const router = express.Router();
const { sendWhatsApp } = require("../utils/sendWhatsApp");

/**
 * Simple liveness test
 * GET /test/ping  -> { ok: true }
 */
router.get("/ping", (req, res) => {
  res.json({ ok: true, at: new Date().toISOString() });
});

/**
 * Send a WhatsApp test message
 * Usage:
 *   GET /test/whatsapp/send?to=+16035551234&body=Hello
 * If ?body is omitted we send a safe default.
 */
router.get("/whatsapp/send", async (req, res) => {
  try {
    const to = req.query.to;
    const body =
      req.query.body ||
      "Test from Back‑In‑Stock app ✅ If you received this, Twilio is working.";

    if (!to) {
      return res
        .status(400)
        .json({ ok: false, error: "Missing ?to= E.164 number, e.g. +16035551234" });
    }

    const result = await sendWhatsApp(to, body);
    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error("test /whatsapp/send error:", err);
    res.status(500).json({ ok: false, error: err.message || "unknown error" });
  }
});

/**
 * Look up a message status by SID
 * GET /test/whatsapp/status?sid=SMxxxxxxxx
 */
router.get("/whatsapp/status", async (req, res) => {
  try {
    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;
    const sid = req.query.sid;
    if (!sid) return res.status(400).json({ ok: false, error: "Missing sid" });

    const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64");
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages/${sid}.json`;

    const r = await fetch(url, {
      headers: { Authorization: `Basic ${auth}` },
    });
    const data = await r.json();
    if (!r.ok) {
      return res.status(500).json({ ok: false, error: data.message || "Twilio error" });
    }
    res.json({
      ok: true,
      sid: data.sid,
      status: data.status,
      to: data.to,
      from: data.from,
      direction: data.direction,
      error_code: data.error_code,
      error_message: data.error_message || null,
      date_created: data.date_created,
      date_sent: data.date_sent,
      date_updated: data.date_updated,
    });
  } catch (err) {
    console.error("test /whatsapp/status error:", err);
    res.status(500).json({ ok: false, error: err.message || "unknown error" });
  }
});

module.exports = router;
