// External integrations for the booking funnel. Each degrades gracefully when
// not configured, and never exposes host credentials to the browser.
//
// Zoom   ZOOM_ACCOUNT_ID + ZOOM_CLIENT_ID + ZOOM_CLIENT_SECRET (Server-to-Server
//        OAuth app, scope meeting:write) => a unique meeting per booking.
//        Otherwise ZOOM_MEETING_URL (a standing meeting link) if set.
// Email  RESEND_API_KEY + EMAIL_FROM => customer confirmation; NOTIFY_EMAIL =>
//        internal notification. Google Calendar also emails its own invite.

const SITE_URL = () => (process.env.SITE_URL || process.env.URL || "https://www.nexusluma.com").replace(/\/$/, "");

async function zoomAccessToken() {
  const { ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET } = process.env;
  if (!ZOOM_ACCOUNT_ID || !ZOOM_CLIENT_ID || !ZOOM_CLIENT_SECRET) return null;
  const res = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(ZOOM_ACCOUNT_ID)}`, {
    method: "POST",
    headers: { authorization: "Basic " + Buffer.from(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`).toString("base64") }
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error("Zoom auth failed: " + (data.reason || data.error || res.status));
  return data.access_token;
}

async function createMeeting({ topic, startISO, minutes, timezone }) {
  try {
    const token = await zoomAccessToken();
    if (token) {
      const res = await fetch("https://api.zoom.us/v2/users/me/meetings", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ topic, type: 2, start_time: startISO, duration: minutes, timezone, settings: { waiting_room: true, join_before_host: false } })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || `Zoom ${res.status}`);
      return { provider: "zoom", meetingId: String(data.id), joinUrl: data.join_url, passcode: data.password || "" };
    }
  } catch (error) {
    console.error("Zoom meeting creation failed; using fallback:", error.message);
  }
  if (process.env.ZOOM_MEETING_URL) return { provider: "zoom", meetingId: "", joinUrl: process.env.ZOOM_MEETING_URL, passcode: "" };
  return { provider: "zoom", meetingId: "", joinUrl: "", passcode: "" };
}

async function deleteMeeting(meetingId) {
  if (!meetingId) return;
  try {
    const token = await zoomAccessToken();
    if (token) await fetch(`https://api.zoom.us/v2/meetings/${encodeURIComponent(meetingId)}`, { method: "DELETE", headers: { authorization: `Bearer ${token}` } });
  } catch (error) {
    console.error("Zoom meeting delete failed:", error.message);
  }
}

async function sendEmail({ to, subject, html, text, replyTo }) {
  const { RESEND_API_KEY, EMAIL_FROM } = process.env;
  if (!RESEND_API_KEY || !EMAIL_FROM || !to) return { sent: false, reason: "not_configured" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, html, text, ...(replyTo ? { reply_to: replyTo } : {}) })
    });
    if (!res.ok) throw new Error(`Resend ${res.status}`);
    return { sent: true };
  } catch (error) {
    console.error("Email send failed:", error.message);
    return { sent: false, reason: error.message };
  }
}

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function formatWhen(startISO, timeZone) {
  const d = new Date(startISO);
  return {
    date: new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(d),
    time: new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(d)
  };
}

function callBrief(lead) {
  return [
    `${lead.firstName} ${lead.lastName}`.trim(),
    lead.businessName,
    lead.profession === "Other Contractor / Home Service" && lead.professionOther ? lead.professionOther : lead.profession,
    lead.serviceArea,
    `Wants more: ${lead.primaryService}`,
    `Website: ${lead.hasWebsite === "yes" ? lead.websiteUrl || "Yes (URL not given)" : "No website"}`,
    lead.adBudget ? `Ad budget: ${lead.adBudget}` : "",
    `Phone: ${lead.phone}`,
    `Email: ${lead.email}`,
    `Lead ID: ${lead.leadId}`
  ].filter(Boolean);
}

function bookingEmails({ lead, booking, manageUrl }) {
  const { date, time } = formatWhen(booking.start, booking.timezone);
  const meeting = booking.zoomJoinUrl
    ? `<p><strong>Join Zoom:</strong> <a href="${esc(booking.zoomJoinUrl)}">${esc(booking.zoomJoinUrl)}</a>${booking.zoomPasscode ? ` (passcode ${esc(booking.zoomPasscode)})` : ""}</p>`
    : `<p>We'll send your Zoom link before the call.</p>`;
  const customer = {
    to: lead.email,
    subject: "Your Nexus Luma Strategy Call Is Booked",
    html: `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:560px;color:#101326">
<h2 style="margin:0 0 12px">You're booked, ${esc(lead.firstName)}.</h2>
<p><strong>${esc(date)}</strong><br>${esc(time)}</p>
${meeting}
<p><strong>What we'll cover:</strong> the services you want more leads for, the areas you want to target, your current online presence, how the Nexus Luma system would work for your business, and a recommended Google Ads starting strategy.</p>
<p>Need to change it? <a href="${esc(manageUrl)}">Reschedule or cancel</a>.</p>
<p style="color:#667">Nexus Luma · Text or call (336) 517-7347</p></div>`,
    text: `You're booked, ${lead.firstName}.\n${date}\n${time}\n${booking.zoomJoinUrl ? "Join Zoom: " + booking.zoomJoinUrl : "We'll send your Zoom link before the call."}\nReschedule or cancel: ${manageUrl}`
  };
  const brief = callBrief(lead);
  const internal = process.env.NOTIFY_EMAIL ? {
    to: process.env.NOTIFY_EMAIL,
    replyTo: lead.email,
    subject: `New strategy call: ${lead.businessName} — ${date}, ${time}`,
    html: `<div style="font-family:-apple-system,Segoe UI,sans-serif;color:#101326"><h3>Call brief</h3><p>${brief.map(esc).join("<br>")}</p><p><strong>${esc(date)} · ${esc(time)}</strong></p><p><a href="${SITE_URL()}/admin/#lead=${esc(lead.leadId)}">Open in admin</a></p></div>`,
    text: brief.join("\n") + `\n${date} ${time}`
  } : null;
  return { customer, internal };
}

module.exports = { SITE_URL, bookingEmails, callBrief, createMeeting, deleteMeeting, formatWhen, sendEmail };
