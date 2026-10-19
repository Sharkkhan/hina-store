// Handles contact form submissions. Sends the message to the store owners via Resend.
const RECIPIENTS = ["shariquehkhan@gmail.com", "hinajawedk@gmail.com"];

function bad(res, message) {
  return res.status(400).json({ error: message });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error("RESEND_API_KEY is not set.");
    return res.status(500).json({ error: "Contact form is not configured yet." });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { return bad(res, "Invalid request."); }
  }

  const name = (body.name || "").trim().slice(0, 100);
  const email = (body.email || "").trim().slice(0, 200);
  const message = (body.message || "").trim().slice(0, 2000);

  if (!name) return bad(res, "Please enter your name.");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad(res, "Please enter a valid email address.");
  if (!message) return bad(res, "Please enter a message.");

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "HINA Store <onboarding@resend.dev>",
        to: RECIPIENTS,
        reply_to: email,
        subject: "New message from " + name + " (HINA store)",
        text: "Name: " + name + "\nEmail: " + email + "\n\n" + message,
      }),
    });
    if (!resp.ok) {
      const err = await resp.text();
      console.error("Resend error:", err);
      return res.status(500).json({ error: "We could not send your message. Please try again." });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Contact error:", err && err.message);
    return res.status(500).json({ error: "We could not send your message. Please try again." });
  }
};
