// Creates a Stripe Checkout Session from the customer's bag and returns its URL.
// The browser only sends piece ids, sizes, quantities and a country. Prices, shipping
// rates and product names are all read from catalog.json on the server, so a customer
// cannot change what they pay by editing the page.

const Stripe = require("stripe");
const catalog = require("../catalog.json");

const SIZES = ["S", "M", "L"];
const MAX_LINES = 20;
const MAX_QTY = 9;

function bad(res, message) {
  return res.status(400).json({ error: message });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error("STRIPE_SECRET_KEY is not set.");
    return res.status(500).json({ error: "Checkout is not configured yet." });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { return bad(res, "Invalid request."); }
  }
  const items = body && body.items;
  const country = body && body.country;

  if (!Array.isArray(items) || items.length < 1 || items.length > MAX_LINES) {
    return bad(res, "Your bag is empty or too large.");
  }
  const ship = catalog.shipping[country];
  if (!ship) return bad(res, "We do not ship to that country yet.");

  const origin = (process.env.SITE_URL || "https://" + req.headers.host).replace(/\/$/, "");
  const lineItems = [];
  const summary = [];

  for (const it of items) {
    const p = catalog.pieces.find((x) => x.id === it.id);
    const qty = Number(it.qty);
    if (!p) return bad(res, "One of the sets in your bag is no longer available.");
    if (!SIZES.includes(it.size)) return bad(res, "Please choose a size for every set.");
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return bad(res, "Invalid quantity.");
    if ((p.soldOut || []).includes(it.size)) {
      return bad(res, p.name + " is sold out in size " + it.size + ".");
    }
    lineItems.push({
      quantity: qty,
      price_data: {
        currency: catalog.currency,
        unit_amount: p.price,
        product_data: {
          name: p.name + " set",
          description: p.color + ", size " + it.size + ". " + p.fit + ".",
          images: [origin + "/img/" + p.id + ".jpg"],
          metadata: { piece: p.id, size: it.size },
        },
      },
    });
    summary.push(p.id + ":" + it.size + "x" + qty);
  }

  try {
    const stripe = new Stripe(key);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      shipping_address_collection: { allowed_countries: [country] },
      shipping_options: [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: { amount: ship.amount, currency: catalog.currency },
            display_name: ship.label,
          },
        },
      ],
      phone_number_collection: { enabled: true },
      allow_promotion_codes: true,
      metadata: { order: summary.join(" ").slice(0, 480) },
      success_url: origin + "/?order=success&session_id={CHECKOUT_SESSION_ID}",
      cancel_url: origin + "/?order=cancelled#closet",
    });
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("Stripe error:", err && err.message);
    return res.status(500).json({ error: "We could not open the payment page. Please try again." });
  }
};
