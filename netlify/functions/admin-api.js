// Admin API for /admin/ (Nexus Luma only). Protected by ADMIN_PASSWORD;
// a successful login returns a signed 12-hour session token.
//
// POST { action: "login", password }
// GET  ?action=leads                       (Authorization: Bearer <token>)
// GET  ?action=lead&id=<leadId>
// POST { action: "status", leadId, status }
// POST { action: "start-project", leadId, email? }  -> personalized project-start link
// GET  ?action=conversions                 -> CSV of verified deposits for Google Ads offline conversion import

const crypto = require("crypto");
const { LEAD_SYSTEM, json, parseBody } = require("./_lead-system");
const { STATUSES, db } = require("./_db");
const { sign, verify } = require("./_tokens");
const { SITE_URL, callBrief, sendEmail } = require("./_integrations");

function passwordOk(given) {
  const expected = process.env.ADMIN_PASSWORD || "";
  if (!expected || expected.length < 10) return false;
  const a = crypto.createHash("sha256").update(String(given || "")).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function authed(event) {
  const header = (event.headers || {}).authorization || (event.headers || {}).Authorization || "";
  return verify(header.replace(/^Bearer\s+/i, ""), "admin");
}

function projectLink(projectId) {
  return `${SITE_URL()}/project/?t=${encodeURIComponent(sign("project", projectId))}`;
}

const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

exports.handler = async (event) => {
  const body = event.httpMethod === "POST" ? parseBody(event) || {} : {};
  const q = event.queryStringParameters || {};
  const action = body.action || q.action;

  if (action === "login") {
    if (!process.env.ADMIN_PASSWORD) return json(503, { error: "Set ADMIN_PASSWORD in Netlify to enable the admin dashboard." });
    if (!passwordOk(body.password)) {
      await new Promise((r) => setTimeout(r, 800)); // slow down guessing
      return json(401, { error: "Incorrect password." });
    }
    return json(200, { token: sign("admin", "admin") });
  }

  if (!authed(event)) return json(401, { error: "Please sign in." });
  const repo = db(event);

  if (action === "leads") {
    const leads = await repo.listLeads();
    const rows = await Promise.all(leads.map(async (l) => {
      const booking = l.activeBookingId ? await repo.getBooking(l.activeBookingId) : null;
      return {
        leadId: l.leadId, name: `${l.firstName} ${l.lastName}`.trim(), businessName: l.businessName, email: l.email,
        profession: l.profession === "Other Contractor / Home Service" ? l.professionOther || l.profession : l.profession,
        serviceArea: l.serviceArea, status: l.status, updatedAt: l.updatedAt, createdAt: l.createdAt,
        callStart: booking && booking.status === "BOOKED" ? booking.start : null,
        source: l.attribution?.utm_source || (l.attribution?.gclid ? "google_ads" : "")
      };
    }));
    return json(200, { leads: rows, statuses: STATUSES });
  }

  if (action === "lead") {
    const lead = await repo.getLead(q.id);
    if (!lead) return json(404, { error: "Lead not found." });
    const bookings = (await Promise.all((lead.bookingIds || []).map((id) => repo.getBooking(id)))).filter(Boolean);
    const project = lead.projectId ? await repo.getProject(lead.projectId) : null;
    return json(200, {
      lead, bookings, project,
      brief: callBrief(lead),
      projectLink: project && project.status !== "DEPOSIT_PAID" ? projectLink(project.projectId) : null
    });
  }

  if (action === "status") {
    if (!STATUSES.includes(body.status)) return json(400, { error: "Unknown status." });
    const lead = await repo.setLeadStatus(body.leadId, body.status, { force: true, note: "admin" });
    if (!lead) return json(404, { error: "Lead not found." });
    return json(200, { ok: true, lead });
  }

  if (action === "start-project") {
    const lead = await repo.getLead(body.leadId);
    if (!lead) return json(404, { error: "Lead not found." });
    const { project, created } = await repo.createProjectForLead(lead.leadId, {
      productKey: LEAD_SYSTEM.productKey,
      projectTotalCents: LEAD_SYSTEM.projectTotalCents,
      depositCents: LEAD_SYSTEM.depositCents,
      balanceCents: LEAD_SYSTEM.balanceCents,
      currency: LEAD_SYSTEM.currency
    });
    if (project.status === "DEPOSIT_PAID") return json(409, { error: "This project's deposit is already paid.", project });
    const link = projectLink(project.projectId);
    let emailed = false;
    if (body.email) {
      const result = await sendEmail({
        to: lead.email,
        subject: "Let's get your lead system started",
        html: `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:560px;color:#101326"><h2>Great talking with you, ${lead.firstName}.</h2><p>Here's your secure link to start your Contractor Lead System project. The $275 deposit starts the build; the remaining $524 follows your project payment terms. Google Ads spend is separate and paid directly to Google.</p><p><a href="${link}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:800">Start My Project — $275</a></p></div>`,
        text: `Start your project: ${link}`
      });
      emailed = result.sent;
    }
    await repo.patchProject(project.projectId, (p) => { p.linkSentAt = new Date().toISOString(); p.linkEmailed = emailed || p.linkEmailed || false; return p; });
    return json(200, { ok: true, created, projectId: project.projectId, link, emailed });
  }

  if (action === "conversions") {
    const payments = await repo.listPayments();
    const header = ["Google Click ID", "Conversion Name", "Conversion Time", "Conversion Value", "Conversion Currency", "Lead ID", "Project ID", "Payment Intent", "utm_source", "utm_campaign", "utm_term"];
    const lines = payments.map((p) => [
      p.attribution?.gclid || "", "Deposit Paid", p.paidAt, (p.amountCents / 100).toFixed(2), (p.currency || "usd").toUpperCase(),
      p.leadId, p.projectId, p.paymentIntentId, p.attribution?.utm_source || "", p.attribution?.utm_campaign || "", p.attribution?.utm_term || ""
    ]);
    const csv = [header, ...lines].map((r) => r.map(csvCell).join(",")).join("\n");
    return { statusCode: 200, headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=nexus-luma-deposit-conversions.csv", "cache-control": "no-store" }, body: csv };
  }

  return json(400, { error: "Unknown action." });
};
