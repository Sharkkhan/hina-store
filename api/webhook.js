// Stripe webhook: emails the owner when a checkout session completes.
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY || "");
const OWNER = "shariquehkhan@gmail.com";

function verifySignature(rawBody, sig, secret) {
  const crypto = require("crypto");
  const parts = {};
  (sig || "").split(",").forEach(function (p) {
    var kv = p.split("=");
    parts[kv[0]] = kv[1];
  });
  if (!parts.t || !parts.v1) return false;
  const expected = crypto.createHmac("sha256", secret).update(parts.t + "." + rawBody, "utf8").digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: "Stripe is not configured." });
  }

  let rawBody = "";
  await new Promise(function (resolve) {
    req.on("data", function (c) { rawBody += c; });
    req.on("end", resolve);
  });

  let event;
  try {
    if (webhookSecret) {
      const sig = req.headers["stripe-signature"];
      if (!verifySignature(rawBody, sig, webhookSecret)) {
        return res.status(400).json({ error: "Invalid signature." });
      }
      event = JSON.parse(rawBody);
    } else {
      event = JSON.parse(rawBody);
    }
  } catch (e) {
    return res.status(400).json({ error: "Invalid payload." });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    try {
      const full = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ["line_items", "customer_details"],
      });
      const items = (full.line_items && full.line_items.data || []).map(function (li) {
        return "- " + li.quantity + " x " + li.description + " (" + ((li.amount_total || 0) / 100).toFixed(2) + " " + (li.currency || "").toUpperCase() + ")";
      }).join("\n");
      const cust = full.customer_details || {};
      const addr = cust.address || {};
      const address = [addr.line1, addr.line2, addr.city, addr.state, addr.postal_code, addr.country].filter(Boolean).join(", ");
      const total = ((full.amount_total || 0) / 100).toFixed(2) + " " + (full.currency || "").toUpperCase();

      const text = "New paid order!\n\n" +
        "Order: " + full.id + "\n" +
        "Total: " + total + "\n\n" +
        "Items:\n" + items + "\n\n" +
        "Customer: " + (cust.name || "") + " <" + (cust.email || "") + ">\n" +
        "Phone: " + (cust.phone || "n/a") + "\n" +
        "Ship to: " + address + "\n";

      const key = process.env.RESEND_API_KEY;
      if (key) {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "HINA Store <onboarding@resend.dev>",
            to: [OWNER],
            subject: "New HINA order: " + total,
            text: text,
          }),
        });
      }
      console.log("ORDER_PAID: " + full.id + " " + total);
    } catch (e) {
      console.error("Webhook order error:", e && e.message);
    }
  }

  return res.status(200).json({ received: true });
};
