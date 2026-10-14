// Lead intake for CLIENT contractor websites built by Nexus Luma.
// A client's quote/estimate form POSTs here; the lead is validated, normalized
// to the shared lead schema, and forwarded to CLIENT_LEADS_WEBHOOK_URL
// (see google-apps-script/client-lead-tracker.gs — one tab per client with a
// status column). This is the foundation for a future client dashboard; it
// does not store leads itself. See docs/LEAD-SYSTEM.md.

const {
  CLIENT_LEAD_STATUSES,
  clean,
  cleanMultiline,
  isEmail,
  isPhone,
  json,
  newId,
  parseBody
} = require("./_lead-system");

function allowedClients() {
  return String(process.env.CLIENT_LEAD_ALLOWED_CLIENTS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function corsHeaders(origin) {
  const allowedOrigins = String(process.env.CLIENT_LEAD_ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const allow = allowedOrigins.includes(origin) ? origin : "";
  return allow
    ? {
        "access-control-allow-origin": allow,
        "access-control-allow-headers": "content-type",
        "access-control-allow-methods": "POST,OPTIONS",
        vary: "origin"
      }
    : {};
}

function normalizeLead(body) {
  return {
    leadId: newId("clead"),
    clientId: clean(body.clientId, 60).toLowerCase(),
    name: clean(body.name, 120),
    phone: clean(body.phone, 40),
    email: clean(body.email, 160).toLowerCase(),
    service: clean(body.service, 160),
    serviceArea: clean(body.zip || body.serviceArea, 80),
    message: cleanMultiline(body.message, 2000),
    source: clean(body.source, 80) || "website",
    campaign: clean(body.campaign || body.utm_campaign, 160),
    gclid: clean(body.gclid, 200),
    landingPage: clean(body.landingPage, 300),
    date: new Date().toISOString(),
    status: CLIENT_LEAD_STATUSES[0]
  };
}

function validateLead(lead, clients) {
  const errors = {};
  if (!lead.clientId || (clients.length && !clients.includes(lead.clientId))) errors.clientId = "Unknown client.";
  if (lead.name.length < 2) errors.name = "Please enter your name.";
  if (!isPhone(lead.phone) && !isEmail(lead.email)) errors.phone = "Please enter a phone number or email.";
  if (lead.email && !isEmail(lead.email)) errors.email = "Please enter a valid email.";
  return errors;
}

exports.handler = async (event) => {
  const origin = (event.headers || {}).origin || (event.headers || {}).Origin || "";
  const cors = corsHeaders(origin);

  const respond = (status, payload) => {
    const response = json(status, payload);
    response.headers = { ...response.headers, ...cors };
    return response;
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" };
  if (event.httpMethod !== "POST") return respond(405, { error: "Use POST." });

  const body = parseBody(event);
  if (!body) return respond(400, { error: "Invalid request." });
  if (clean(body.website_confirm)) return respond(200, { ok: true }); // honeypot

  const lead = normalizeLead(body);
  const errors = validateLead(lead, allowedClients());
  if (Object.keys(errors).length) return respond(422, { error: "Please check the highlighted fields.", fields: errors });

  const target = process.env.CLIENT_LEADS_WEBHOOK_URL;
  if (!target) {
    console.error("CLIENT_LEADS_WEBHOOK_URL is not configured; client lead not stored.", lead.leadId);
    return respond(503, { error: "Lead intake is not configured yet. Please call us instead." });
  }

  try {
    const response = await fetch(target, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...lead, secret: process.env.CLIENT_LEADS_WEBHOOK_SECRET || "" }),
      redirect: "manual"
    });
    if (response.status >= 400) throw new Error(`Webhook responded ${response.status}`);
  } catch (error) {
    console.error("Client lead forwarding failed:", error.message);
    return respond(502, { error: "We couldn't send your request. Please call us instead." });
  }

  return respond(200, { ok: true, leadId: lead.leadId });
};

exports.normalizeLead = normalizeLead;
exports.validateLead = validateLead;
