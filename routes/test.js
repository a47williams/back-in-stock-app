// routes/test.js
const express = require("express");
const router = express.Router();
const sendWhatsApp = require("../utils/sendWhatsApp");

// Normalize incoming numbers to "whatsapp:+<digits>"
function normalizeToWhatsApp(raw) {
  if (!raw) return null;

  // decode, trim, remove spaces
  let s = decodeURIComponent(String(raw)).trim().replace(/\s+/g, "");

  // Accept a few common shapes and fix them:
  // "+15551234567"            -> "whatsapp:+15551234567"
  // "15551234567"             -> "whatsapp:+15551234567"
  // "whatsapp:15551234567"    -> "whatsapp:+15551234567"
  // "whatsapp:+15551234567"   -> (already correct)
  if (!s.startsWith("whatsapp:")) {
    // If it already starts with '+' or digit, we'll handle below
    s = "whatsapp:" + s;
  }

  // Now s starts with "whatsapp:" — ensure the rest begins with "+"
  const rest = s.slice("whatsapp:".length);
  if (!rest.startsWith("+")) {
    // If it's all digits, add '+'
    if (/^\d+$/.test(rest)) {
      s = "whatsapp:+" + rest;
    } else {
      // maybe they passed "whatsapp:%2B..." which decode already handled
      // or "whatsapp:+..." which is fine—we only land here if non-digit junk exists
    }
  }

  // Final sanity: must be whatsapp:+ followed by 7-15 digits
  if (!/^whatsapp:\+\d{7,15}$/.test(s)) return null;

  return s;
}

// Simple health
router.get("/health", (_req, res) => {
  res.json({ ok: true, service: "test", time: new Date().toISOString() });
});

// Send a WhatsApp test message
router.post("/whatsapp/send", express.json(), async (req, res) => {
  try {
    const toRaw = req.body?.to ?? req.query?.to;
    const to = normalizeToWhatsApp(toRaw);

    if (!to) {
      return res.status(400).json({
        ok: false,
        error: "Invalid 'to' — must look like whatsapp:+15551234567.",
        received: toRaw
      });
    }

    const message =
      req.body?.message ??
      "Test from Back-in-Stock app: Hello from your Render service 👋";

    const twilioResp = await sendWhatsApp(to, message);
    return res.json({ ok: true, sid: twilioResp.sid });
  } catch (err) {
    const code = err && err.code;
    const msg = err?.message || String(err);
    return res.status(500).json({ ok: false, code, error: msg });
  }
});

// Fetch a Twilio message status (optional if you already have this)
router.get("/whatsapp/status", async (req, res) => {
  try {
    const sid = req.query?.sid;
    if (!sid) return res.status(400).json({ ok: false, error: "Missing sid" });

    const twilio = require("twilio")(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    const msg = await twilio.messages(sid).fetch();
    res.json({
      ok: true,
      sid: msg.sid,
      status: msg.status,
      to: msg.to,
      from: msg.from,
      direction: msg.direction,
      error_code: msg.errorCode,
      error_message: msg.errorMessage,
      date_created: msg.dateCreated,
      date_sent: msg.dateSent,
      date_updated: msg.dateUpdated
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

module.exports = router;
