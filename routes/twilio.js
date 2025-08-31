// routes/twilio.js
const express = require("express");
const router = express.Router();
const Subscriber = require("../models/Subscriber");
const twilio = require("twilio");

const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, WHATSAPP_SENDER } = process.env;
const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

function wpAddr(n) { return String(n || "").startsWith("whatsapp:") ? n : `whatsapp:${n}`; }

router.post("/inbound", async (req, res) => {
  try {
    const fromRaw = req.body.From || "";
    const from = fromRaw.replace(/^whatsapp:/, "");
    const body = String(req.body.Body || "").trim().toLowerCase();

    if (!from) return res.sendStatus(200);

    // mark session open time
    await Subscriber.updateMany({ phone: from }, { $set: { lastInboundAt: new Date() } });

    // user consent to receive link
    const isYes = /^(yes|y|send|link|ok|sure|go)$/i.test(body);
    if (!isYes) return res.sendStatus(200);

    // most recent awaiting row
    const sub = await Subscriber.findOne({ phone: from, awaitingReply: true }).sort({ templateSentAt: -1 });
    if (!sub) return res.sendStatus(200);

    const fullUrl = sub.productUrl ? decodeURIComponent(sub.productUrl) : null;
    const title = sub.productTitle || "your item";
    const text = fullUrl
      ? `Here is your link to ${title}: ${fullUrl}`
      : `Here is your link to ${title}.`;

    await client.messages.create({
      from: wpAddr(WHATSAPP_SENDER),
      to: wpAddr(from),
      body: text,
    });

    await Subscriber.deleteOne({ _id: sub._id }); // fulfilled
    console.log("[Twilio] follow-up link sent to", from);
    res.sendStatus(200);
  } catch (e) {
    console.error("[Twilio] inbound error:", e.message);
    res.sendStatus(200);
  }
});

module.exports = router;
