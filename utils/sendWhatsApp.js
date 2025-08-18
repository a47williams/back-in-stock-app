// utils/sendWhatsApp.js
const twilio = require("twilio");

// --- ENV ---
const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;           // e.g. ACxxxxxxxx...
const AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN;            // your auth token
const FROM_PHONE  = process.env.TWILIO_PHONE_NUMBER || "whatsapp:+14155238886"; // Twilio sandbox default
const CONTENT_SID = process.env.TWILIO_CONTENT_SID || "";     // e.g. HXxxxxxxxx... (optional)

// --- BASIC VALIDATION ---
if (!ACCOUNT_SID?.startsWith?.("AC")) console.warn("⚠️ TWILIO_ACCOUNT_SID missing/invalid");
if (!AUTH_TOKEN) console.warn("⚠️ TWILIO_AUTH_TOKEN missing");
if (!FROM_PHONE) console.warn("⚠️ TWILIO_PHONE_NUMBER missing (using sandbox default if available)");

const client = twilio(ACCOUNT_SID, AUTH_TOKEN);

/**
 * Build a human-friendly message, with an add-to-cart link when possible.
 */
function buildBody({ shop, variantId, style = "friendly" }) {
  const cartUrl =
    shop && variantId ? `https://${shop}/cart/${encodeURIComponent(variantId)}:1` : "";

  switch ((style || "friendly").toLowerCase()) {
    case "formal":
      return cartUrl
        ? `Good news — the item you requested is back in stock. You can purchase it here: ${cartUrl}`
        : `Good news — the item you requested is back in stock.`;
    case "urgent":
      return cartUrl
        ? `🔥 Back in stock now! Limited quantities available. Grab it before it's gone: ${cartUrl}`
        : `🔥 Back in stock now! Limited quantities available.`;
    case "friendly":
    default:
      return cartUrl
        ? `Hey! Your item is back in stock 🙌 Tap to buy: ${cartUrl}`
        : `Hey! Your item is back in stock 🙌`;
  }
}

/**
 * Send a WhatsApp message. Uses Content Template if TWILIO_CONTENT_SID is set, otherwise plain Body.
 * @param {string} toPhone E.164 phone with or without "whatsapp:" prefix
 * @param {object} ctx { shop, productId, variantId, style, previewUrl? }
 * @returns {Promise<boolean>}
 */
async function sendWhatsApp(toPhone, ctx = {}) {
  try {
    // normalize WhatsApp addressing
    const to = toPhone.startsWith("whatsapp:") ? toPhone : `whatsapp:${toPhone}`;
    const from = FROM_PHONE.startsWith("whatsapp:") ? FROM_PHONE : `whatsapp:${FROM_PHONE}`;

    // build text body (used as fallback or for non-template sends)
    const body = buildBody({
      shop: ctx.shop,
      variantId: ctx.variantId,
      style: ctx.style || "friendly",
    });

    // Prefer Content Template if provided (avoids session limits & ensures compliance)
    if (CONTENT_SID) {
      // You can pass variables your template expects; here are safe defaults:
      const variables = {
        // Example keys — change to match your template variable schema
        "1": ctx.shop || "",
        "2": ctx.variantId || "",
        "3": ctx.previewUrl || "",        // optional product URL
        "4": body,                         // we also pass composed text in case your template uses it
      };

      const opts = {
        to,
        from,
        contentSid: CONTENT_SID,
        contentVariables: JSON.stringify(variables),
      };

      // DEBUG: log what we're sending (without secrets)
      console.log("➡️ Twilio send (template):", {
        to,
        from,
        contentSid: CONTENT_SID.slice(0, 4) + "…",
        hasVariables: !!opts.contentVariables,
      });

      const msg = await client.messages.create(opts);
      console.log("✅ WhatsApp sent (template)", { sid: msg.sid, status: msg.status });
      return true;
    }

    // Fallback: plain text Body (requires 24h session unless the user messaged you)
    const safeBody = (body && body.trim()) ? body.trim() : "Your requested item is back in stock!";
    const opts = { to, from, body: safeBody };

    console.log("➡️ Twilio send (body):", { to, from, bodyLen: safeBody.length });

    const msg = await client.messages.create(opts);
    console.log("✅ WhatsApp sent (body)", { sid: msg.sid, status: msg.status });
    return true;
  } catch (err) {
    const code = err?.code;
    const message = err?.message || String(err);
    console.error("❌ sendWhatsApp error:", { code, error: message });

    // Extra hint for 21619
    if (code === 21619) {
      console.error(
        "Hint 21619: Twilio requires either Body, MediaUrl(s) or ContentSid. " +
        "Set TWILIO_CONTENT_SID to use a WhatsApp template, or ensure 'body' is non-empty."
      );
    }
    return false;
  }
}

module.exports = sendWhatsApp;
