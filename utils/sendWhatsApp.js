// utils/sendWhatsApp.js
// Sends a WhatsApp message via Twilio. Supports either a plain text body
// or a WhatsApp Content Template (ContentSid + ContentVariables).

const twilio = require("twilio");

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER, // must be like: "whatsapp:+14155238886" (sandbox) or your approved WA number
} = process.env;

// Create client once (will throw early if creds are missing)
let client;
(function ensureClient() {
  if (!TWILIO_ACCOUNT_SID || !/^AC/.test(TWILIO_ACCOUNT_SID)) {
    throw new Error("TWILIO_ACCOUNT_SID missing or invalid (must start with AC)");
  }
  if (!TWILIO_AUTH_TOKEN) {
    throw new Error("TWILIO_AUTH_TOKEN missing");
  }
  if (!TWILIO_PHONE_NUMBER || !TWILIO_PHONE_NUMBER.startsWith("whatsapp:")) {
    throw new Error(
      "TWILIO_PHONE_NUMBER missing or invalid. Set to e.g. 'whatsapp:+14155238886'"
    );
  }
  client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
})();

/**
 * Send a WhatsApp message.
 *
 * @param {string} to E.164 (e.g. +16035551212) OR "whatsapp:+16035551212"
 * @param {string} [message] Plain text body fallback
 * @param {object} [opts]
 * @param {string} [opts.contentSid] Twilio Content Template SID (e.g. HXXXXXXXX)
 * @param {object|string} [opts.contentVariables] JSON object or string for template variables
 * @param {string} [opts.mediaUrl] Optional single media URL for body messages
 * @returns {Promise<{ok:boolean, sid?:string, error?:any}>}
 */
async function sendWhatsApp(to, message = "", opts = {}) {
  try {
    // Normalize "to" into whatsapp:+E164
    const toWhatsApp = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;

    // Build Twilio create() payload
    const payload = {
      from: TWILIO_PHONE_NUMBER, // must be a WhatsApp-enabled number, prefixed with "whatsapp:"
      to: toWhatsApp,
    };

    // Prefer Content Template if provided
    if (opts.contentSid) {
      payload.contentSid = opts.contentSid;

      if (opts.contentVariables) {
        payload.contentVariables =
          typeof opts.contentVariables === "string"
            ? opts.contentVariables
            : JSON.stringify(opts.contentVariables);
      } else {
        // Ensure it's at least an empty object string
        payload.contentVariables = "{}";
      }
    } else {
      // Fallback to simple text body (Twilio error 21619 happens when neither body nor media is set)
      const body = (message || "").trim();
      if (!body && !opts.mediaUrl) {
        // Provide a safe default to avoid 21619
        payload.body = "Heads up! This item is back in stock.";
      } else if (body) {
        payload.body = body;
      }
      if (opts.mediaUrl) {
        payload.mediaUrl = [opts.mediaUrl];
      }
    }

    const resp = await client.messages.create(payload);

    // Minimal log line (server logs)
    console.log("✅ WhatsApp sent", {
      sid: resp.sid,
      to: resp.to,
      status: resp.status,
    });

    return { ok: true, sid: resp.sid };
  } catch (err) {
    // Helpful error details for Render logs
    let twilioCode, twilioMsg;
    if (err && err.code) twilioCode = err.code;
    if (err && err.message) twilioMsg = err.message;

    console.error("❌ sendWhatsApp error:", {
      code: twilioCode,
      message: twilioMsg,
      raw: err?.moreInfo || err,
    });

    return { ok: false, error: twilioMsg || String(err) };
  }
}

module.exports = { sendWhatsApp };
