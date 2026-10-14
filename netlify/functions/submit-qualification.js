// Receives a Contractor Lead System qualification (from /start/) or a
// strategy-call request (from /book/), validates it server-side, and forwards
// it to the pipeline sheet/CRM. Returns a leadId used to tie the deposit to it.

const {
  clean,
  cleanMultiline,
  forwardPipelineRecord,
  isEmail,
  isPhone,
  json,
  newId,
  parseBody
} = require("./_lead-system");

const INTENTS = new Set(["deposit", "strategy_call"]);
const AD_BUDGETS = new Set(["$300–$500", "$500–$1,000", "$1,000–$2,500", "$2,500+", "Not sure yet", ""]);

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Use POST." });
  }

  const body = parseBody(event);
  if (!body) return json(400, { error: "Invalid JSON request body." });

  // Honeypot: real visitors never fill this hidden field.
  if (clean(body.company_url_confirm)) {
    return json(200, { ok: true, leadId: newId("lead") });
  }

  const intent = INTENTS.has(body.intent) ? body.intent : "deposit";
  const record = {
    leadId: newId("lead"),
    intent,
    status: intent === "deposit" ? "QUALIFIED" : "CALL_REQUESTED",
    submittedAt: new Date().toISOString(),
    name: clean(body.name, 120),
    business: clean(body.business, 160),
    email: clean(body.email, 160).toLowerCase(),
    phone: clean(body.phone, 40),
    trade: clean(body.trade, 80),
    service: clean(body.service, 160),
    serviceArea: clean(body.serviceArea, 160),
    hasWebsite: clean(body.hasWebsite, 60),
    website: clean(body.website, 240),
    runningAds: clean(body.runningAds, 60),
    adBudget: AD_BUDGETS.has(clean(body.adBudget, 40)) ? clean(body.adBudget, 40) : "",
    notes: cleanMultiline(body.notes, 1500),
    source: clean(body.source, 80) || "website",
    campaign: {
      utm_source: clean(body.campaign?.utm_source, 120),
      utm_medium: clean(body.campaign?.utm_medium, 120),
      utm_campaign: clean(body.campaign?.utm_campaign, 160),
      utm_term: clean(body.campaign?.utm_term, 160),
      utm_content: clean(body.campaign?.utm_content, 160),
      gclid: clean(body.campaign?.gclid, 200),
      landingPage: clean(body.campaign?.landingPage, 300),
      referrer: clean(body.campaign?.referrer, 300)
    }
  };

  const errors = {};
  if (record.name.length < 2) errors.name = "Please enter your name.";
  if (!record.business) errors.business = "Please enter your business name.";
  if (!isEmail(record.email)) errors.email = "Please enter a valid email.";
  if (!isPhone(record.phone)) errors.phone = "Please enter a valid phone number.";
  if (!record.trade) errors.trade = "Please choose your type of business.";
  if (intent === "deposit") {
    if (!record.service) errors.service = "Please tell us which service you want more leads for.";
    if (!record.serviceArea) errors.serviceArea = "Please tell us where you provide service.";
  }
  if (Object.keys(errors).length) {
    return json(422, { error: "Please check the highlighted fields.", fields: errors });
  }

  const forwarded = await forwardPipelineRecord(record);
  if (!forwarded.ok) {
    // Still let the visitor continue; the deposit metadata and Stripe webhook
    // carry the same details, so the lead is recoverable.
    console.error("Qualification forwarding did not confirm:", forwarded);
  }

  return json(200, { ok: true, leadId: record.leadId });
};
