// Post-call project start (/project/) and onboarding (/onboarding/).
// Only reachable through the personalized link Nexus Luma sends after the
// Zoom call (admin "Send Project Start Link"). Payment is always attached to
// the existing lead and project — no new customer record is created.
//
// GET  ?t=<projectToken>                                   project summary
// POST { t, action: "checkout" }                           $275 PaymentIntent (amount fixed server-side)
// POST { t, action: "verify", paymentIntentId }            server-side verification -> DEPOSIT_PAID
// POST { t, action: "onboarding", data, files }            detailed onboarding (after payment only)

const { LEAD_SYSTEM, clean, cleanMultiline, isVerifiedDeposit, json, parseBody, publishableKeyFor, stripeMode, stripeRequest } = require("../_lead-system");
const { db } = require("./_db");
const { verify } = require("./_tokens");
const { sendEmail } = require("./_integrations");

const ONBOARDING_FIELDS = {
  businessDescription: 2000, services: 2000, serviceAreas: 1000, businessHours: 300, brandColors: 200,
  domain: 200, currentWebsite: 240, googleAccountEmail: 160, googleAdsAccount: 60, competitors: 1000,
  websitePreferences: 2000, photosLink: 400, licenseInsurance: 400, reviewsLink: 400, notes: 2000
};
const MAX_FILES = 6;
const MAX_FILE_BYTES = 3 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml", "application/pdf"]);

async function markPaid(repo, project, lead, intent) {
  const result = await repo.recordDepositPaid({
    paymentIntentId: intent.id, projectId: project.projectId, leadId: project.leadId,
    amountCents: intent.amount_received, currency: intent.currency, attribution: lead?.attribution || {}
  });
  if (result.firstTime && process.env.NOTIFY_EMAIL && lead) {
    await sendEmail({
      to: process.env.NOTIFY_EMAIL,
      subject: `Deposit paid: ${lead.businessName} ($${(intent.amount_received / 100).toFixed(2)})`,
      text: `${lead.firstName} ${lead.lastName} (${lead.businessName}) paid the $275 deposit.\nLead ${lead.leadId} · Project ${project.projectId} · ${intent.id}`
    });
  }
  return result;
}
exports.markPaid = markPaid;

exports.handler = async (event) => {
  const body = event.httpMethod === "POST" ? parseBody(event) || {} : {};
  const token = verify(event.httpMethod === "GET" ? event.queryStringParameters?.t : body.t, "project");
  if (!token) return json(401, { error: "This link is invalid or has expired. Please contact Nexus Luma for a new one." });

  const repo = db(event);
  let project = await repo.getProject(token.id);
  if (!project) return json(404, { error: "Project not found." });
  const lead = await repo.getLead(project.leadId);
  const paid = Boolean(project.depositPaidAt);

  const summary = () => ({
    projectId: project.projectId,
    firstName: lead?.firstName || "",
    businessName: lead?.businessName || "",
    email: lead?.email || "",
    phone: lead?.phone || "",
    productName: LEAD_SYSTEM.productName,
    projectTotalCents: project.projectTotalCents,
    depositCents: project.depositCents,
    balanceCents: project.balanceCents,
    paid: Boolean(project.depositPaidAt),
    onboardingSubmitted: Boolean(project.onboardingSubmittedAt)
  });

  if (event.httpMethod === "GET") return json(200, summary());
  if (event.httpMethod !== "POST") return json(405, { error: "Use GET or POST." });

  if (body.action === "checkout") {
    if (paid) return json(409, { error: "Your deposit is already paid.", ...summary() });
    const secretKey = process.env.STRIPE_SECRET_KEY;
    const publishableKey = secretKey ? publishableKeyFor(secretKey) : "";
    if (!secretKey || !publishableKey) return json(500, { error: "Payments are not configured yet." });

    // Reuse this project's open PaymentIntent (refresh/back/double-click safe).
    if (project.pendingPaymentIntentId) {
      try {
        const existing = await stripeRequest("GET", `payment_intents/${encodeURIComponent(project.pendingPaymentIntentId)}`, secretKey);
        if (existing.status === "succeeded" && isVerifiedDeposit(existing, project.projectId)) {
          await markPaid(repo, project, lead, existing);
          project = await repo.getProject(project.projectId);
          return json(409, { error: "Your deposit is already paid.", ...summary() });
        }
        if (["requires_payment_method", "requires_confirmation", "requires_action"].includes(existing.status) && existing.amount === LEAD_SYSTEM.depositCents) {
          return json(200, { clientSecret: existing.client_secret, paymentIntentId: existing.id, publishableKey, mode: stripeMode(secretKey), amount: existing.amount, ...summary() });
        }
      } catch (error) {
        console.error("Could not reuse PaymentIntent:", error.message);
      }
    }

    const a = lead?.attribution || {};
    const metadata = {
      product: LEAD_SYSTEM.productKey, payment_type: "deposit",
      project_id: project.projectId, lead_id: project.leadId,
      project_total_cents: String(project.projectTotalCents), deposit_cents: String(LEAD_SYSTEM.depositCents), balance_cents: String(project.balanceCents),
      name: `${lead?.firstName || ""} ${lead?.lastName || ""}`.trim(), business: lead?.businessName || "", email: lead?.email || "",
      gclid: a.gclid || "", utm_source: a.utm_source || "", utm_campaign: a.utm_campaign || "", utm_term: a.utm_term || ""
    };
    const params = new URLSearchParams();
    params.set("amount", String(LEAD_SYSTEM.depositCents));
    params.set("currency", LEAD_SYSTEM.currency);
    params.set("description", `Nexus Luma ${LEAD_SYSTEM.productName} — project deposit ($275 of $799; $524 remaining)`);
    if (lead?.email) params.set("receipt_email", lead.email);
    params.append("payment_method_types[]", "card");
    Object.entries(metadata).forEach(([k, v]) => params.set(`metadata[${k}]`, clean(v, 450)));

    try {
      const intent = await stripeRequest("POST", "payment_intents", secretKey, params);
      await repo.patchProject(project.projectId, (p) => { p.pendingPaymentIntentId = intent.id; p.checkoutStartedAt = new Date().toISOString(); return p; });
      return json(200, { clientSecret: intent.client_secret, paymentIntentId: intent.id, publishableKey, mode: stripeMode(secretKey), amount: LEAD_SYSTEM.depositCents, ...summary() });
    } catch (error) {
      console.error("Deposit PaymentIntent failed:", error.message);
      return json(502, { error: "We couldn't start secure checkout. Please try again in a moment." });
    }
  }

  if (body.action === "verify") {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    const paymentIntentId = clean(body.paymentIntentId, 80);
    if (!secretKey) return json(500, { error: "Payments are not configured yet." });
    if (!/^pi_[A-Za-z0-9]+$/.test(paymentIntentId)) return json(400, { error: "Missing payment reference." });
    let intent;
    try {
      intent = await stripeRequest("GET", `payment_intents/${encodeURIComponent(paymentIntentId)}`, secretKey);
    } catch (error) {
      return json(502, { verified: false, error: "We couldn't confirm the payment yet." });
    }
    if (intent.status === "processing") return json(200, { verified: false, status: "processing" });
    if (!isVerifiedDeposit(intent, project.projectId)) return json(200, { verified: false, status: intent.status });
    await markPaid(repo, project, lead, intent);
    project = await repo.getProject(project.projectId);
    return json(200, { verified: true, paymentIntentId: intent.id, amount: intent.amount_received, ...summary() });
  }

  if (body.action === "onboarding") {
    if (!paid) return json(403, { error: "Onboarding opens after your deposit is paid." });
    const data = {};
    for (const [key, max] of Object.entries(ONBOARDING_FIELDS)) {
      const value = max > 400 ? cleanMultiline(body.data?.[key], max) : clean(body.data?.[key], max);
      if (value) data[key] = value;
    }
    const files = Array.isArray(body.files) ? body.files.slice(0, MAX_FILES) : [];
    const saved = [];
    for (const [i, f] of files.entries()) {
      const type = String(f?.type || "");
      const buffer = Buffer.from(String(f?.base64 || ""), "base64");
      if (!ALLOWED_TYPES.has(type) || !buffer.length || buffer.length > MAX_FILE_BYTES) continue;
      const name = clean(f.name, 80).replace(/[^\w.\-]+/g, "_") || `file-${i}`;
      const key = `uploads/${project.projectId}/${Date.now()}-${i}-${name}`;
      await repo.store.setBinary(key, buffer, type);
      saved.push({ key, name, type, bytes: buffer.length, kind: clean(f.kind, 20) });
    }
    await repo.patchProject(project.projectId, (p) => {
      p.onboarding = { ...(p.onboarding || {}), ...data, files: [...(p.onboarding?.files || []), ...saved] };
      p.onboardingSubmittedAt = new Date().toISOString();
      p.status = "ONBOARDING_SUBMITTED";
      return p;
    });
    await repo.setLeadStatus(project.leadId, "PROJECT_STARTED", { force: true, note: "onboarding submitted" });
    if (process.env.NOTIFY_EMAIL && lead) {
      await sendEmail({ to: process.env.NOTIFY_EMAIL, subject: `Onboarding submitted: ${lead.businessName}`, text: `Project ${project.projectId} onboarding is in. ${saved.length} file(s).` });
    }
    project = await repo.getProject(project.projectId);
    return json(200, { ok: true, filesSaved: saved.length, ...summary() });
  }

  return json(400, { error: "Unknown action." });
};
