// routes/webhook.js (HOTFIX)
const express = require("express");
const crypto = require("crypto");
const router = express.Router();

// RAW parser so we can compute HMAC over exact bytes
const rawParser = express.raw({ type: "application/json" });

// --- Small in‑memory de‑dupe (10 min TTL) ---
const seen = new Map();
function remember(id, ttlMs = 10 * 60 * 1000) {
  const now = Date.now();
  // cleanup
  for (const [k, v] of seen) {
    if (v < now) seen.delete(k);
  }
  seen.set(id, now + ttlMs);
}
function isSeen(id) {
  const exp = seen.get(id);
  return exp && exp > Date.now();
}

const { notifyFromWebhookPayload } = require("../utils/shopifyApi");

function timingSafeEq(a, b) {
  try {
    const A = Buffer.from(a || "");
    const B = Buffer.from(b || "");
    if (A.length !== B.length) return false;
    return crypto.timingSafeEqual(A, B);
  } catch {
    return false;
  }
}

function verifyShopifyHmac(req) {
  const secret = process.env.SHOPIFY_API_SECRET || "";
  if (!secret) return { ok: false, reason: "missing SHOPIFY_API_SECRET" };

  const provided = req.get("X-Shopify-Hmac-Sha256") || "";
  if (!provided) return { ok: false, reason: "no hmac header" };

  const computed = crypto.createHmac("sha256", secret).update(req.body).digest("base64");
  return { ok: timingSafeEq(computed, provided), provided, computed };
}

router.post("/inventory", rawParser, async (req, res) => {
  const topic = req.get("X-Shopify-Topic"); // 'inventory_levels/update' or 'products/update'
  const shop = req.get("X-Shopify-Shop-Domain") || "";
  const deliveryId = req.get("X-Shopify-Delivery-Id") || "";
  const len = req.get("content-length") || "";

  // De-dupe: same delivery should never be processed twice
  if (deliveryId && isSeen(deliveryId)) {
    console.log("🔁 Duplicate delivery ignored", { deliveryId, topic, shop });
    return res.status(200).json({ ok: true, duplicate: true });
  }

  try {
    const skip = String(process.env.SKIP_HMAC || "").toLowerCase() === "true";
    const mode = (process.env.HMAC_MODE || "strict").toLowerCase(); // 'strict' | 'lenient'

    if (!skip) {
      const v = verifyShopifyHmac(req);
      if (!v.ok) {
        if (mode === "lenient") {
          console.warn("⚠️  HMAC invalid (lenient mode) — continuing", {
            topic,
            shop,
            len,
          });
        } else {
          console.error("❌ HMAC invalid (strict) — rejecting", {
            topic,
            shop,
            len,
          });
          return res.status(401).json({ ok: false });
        }
      } else {
        console.log("✅ HMAC valid", { topic, shop, len });
      }
    } else {
      console.log("⚠️  HMAC verification skipped (SKIP_HMAC=true)", { topic, shop, len });
    }

    // Parse JSON from raw bytes
    let payload = {};
    try {
      payload = JSON.parse(req.body.toString("utf8"));
    } catch (e) {
      console.error("❌ JSON parse error", e.message);
      return res.status(400).json({ ok: false, error: "bad json" });
    }

    // Mark delivery as seen now (even if we error later, Shopify will retry with the same id)
    if (deliveryId) remember(deliveryId);

    // Notify based on payload
    const result = await notifyFromWebhookPayload({ topic, shop, payload });
    console.log("📦 Webhook processed", {
      topic,
      shop,
      totalNotified: result?.totalNotified ?? 0,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("❌ Webhook processing error", err);
    return res.status(500).json({ ok: false });
  }
});

module.exports = router;
