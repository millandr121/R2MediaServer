export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }
    let payload;
    try {
      payload = await request.json();
    } catch {
      return new Response("Bad request — expected JSON body", { status: 400 });
    }
    const from    = payload.from    || "unknown sender";
    const subject = payload.subject || "(no subject)";
    const text    = payload.text    || "";
    const html    = payload.html    || "";
    const to      = Array.isArray(payload.to) ? payload.to[0] : (payload.to || "team@bamfieldmediahouse.ca");
    const forwardHeaderText =
      `---------- Forwarded message ----------\n` +
      `From: ${from}\n` +
      `To: ${to}\n` +
      `Subject: ${subject}\n\n`;
    const forwardHeaderHtml =
      `<div style="border-left:3px solid #ccc;padding-left:12px;margin:16px 0;` +
      `color:#555;font-size:13px;font-family:sans-serif;">` +
      `<p style="margin:0 0 6px 0"><strong>---------- Forwarded message ----------</strong></p>` +
      `<p style="margin:0">From: ${escapeHtml(from)}</p>` +
      `<p style="margin:0">To: ${escapeHtml(to)}</p>` +
      `<p style="margin:0">Subject: ${escapeHtml(subject)}</p>` +
      `</div>`;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Bamfield Media House <team@bamfieldmediahouse.ca>",
        to: ["andrewglennmiller@gmail.com"],
        reply_to: [from],
        subject: subject,
        text: forwardHeaderText + text,
        html: forwardHeaderHtml + (html || `<p>${escapeHtml(text)}</p>`),
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("Resend API error:", res.status, err);
      return new Response("Forward failed", { status: 502 });
    }
    return new Response("OK", { status: 200 });
  },
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
