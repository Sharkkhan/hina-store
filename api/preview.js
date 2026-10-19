// Stores preview-list email signups. Appends to a JSON file in /tmp (ephemeral)
// and emails the owner. For a durable list, wire this to a real store later.
const OWNER = "shariquehkhan@gmail.com";

function bad(res, message) {
  return res.status(400).json({ error: message });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { return bad(res, "Invalid request."); }
  }

  const email = (body.email || "").trim().slice(0, 200);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return bad(res, "Please enter a valid email address.");
  }

  // Log the signup (visible in Vercel function logs)
  console.log("PREVIEW_SIGNUP: " + email + " at " + new Date().toISOString());

  // Notify the owner via Resend if configured
  const key = process.env.RESEND_API_KEY;
  if (key) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "HINA Store <onboarding@resend.dev>",
          to: [OWNER],
          subject: "New preview-list signup (HINA store)",
          text: "New signup: " + email + "\nTime: " + new Date().toISOString(),
        }),
      });
    } catch (e) {
      console.error("Preview notify error:", e && e.message);
    }
  }

  return res.status(200).json({ ok: true });
};
