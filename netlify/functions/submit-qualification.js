// Step 4 of the funnel: the short qualification form on /book/.
// Saves (or updates) ONE lead in the CRM BEFORE scheduling, so an abandoned
// booking still leaves a lead (status QUALIFIED_FORM_COMPLETED). Returns a
// signed lead token; the scheduling step uses it so the visitor never
// re-enters their details.

const { clean, forwardPipelineRecord, isEmail, isPhone, json, parseBody } = require("./_lead-system");
const { db } = require("./_db");
const { sign, verify } = require("./_tokens");

const PROFESSIONS = [
  "General Contractor", "Roofing", "HVAC", "Plumbing", "Electrical", "Remodeling", "Painting", "Flooring",
  "Landscaping", "Concrete", "Fencing", "Deck Building", "Pressure Washing", "Handyman", "Cleaning",
  "Other Contractor / Home Service"
];
const AD_BUDGETS = ["$300–$500", "$500–$1,000", "$1,000–$2,500", "$2,500+", "Not sure yet"];
const ATTRIBUTION_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "gbraid", "wbraid", "landingPage", "referrer", "firstSeenAt"];

function normalizeUrl(value) {
  const v = clean(value, 240);
  if (!v) return "";
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

exports.PROFESSIONS = PROFESSIONS;
exports.AD_BUDGETS = AD_BUDGETS;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Use POST." });

  const body = parseBody(event);
  if (!body) return json(400, { error: "Invalid request." });

  // Honeypot: bots fill hidden fields; humans never see it.
  if (clean(body.company_url_confirm)) return json(200, { ok: true, leadToken: "", leadId: "" });

  const fields = {
    firstName: clean(body.firstName, 60),
    lastName: clean(body.lastName, 60),
    businessName: clean(body.businessName, 160),
    email: clean(body.email, 160).toLowerCase(),
    phone: clean(body.phone, 40),
    profession: PROFESSIONS.includes(body.profession) ? body.profession : "",
    professionOther: clean(body.professionOther, 80),
    primaryService: clean(body.primaryService, 160),
    serviceArea: clean(body.serviceArea, 160),
    hasWebsite: body.hasWebsite === "yes" ? "yes" : body.hasWebsite === "no" ? "no" : "",
    websiteUrl: body.hasWebsite === "yes" ? normalizeUrl(body.websiteUrl) : "",
    adBudget: AD_BUDGETS.includes(body.adBudget) ? body.adBudget : ""
  };

  const errors = {};
  if (!fields.profession) errors.profession = "Choose your type of business.";
  if (fields.profession === "Other Contractor / Home Service" && !fields.professionOther) errors.professionOther = "Tell us your type of business.";
  if (!fields.primaryService) errors.primaryService = "Tell us the service you want more leads for.";
  if (!fields.serviceArea) errors.serviceArea = "Tell us where you want customers.";
  if (!fields.hasWebsite) errors.hasWebsite = "Choose yes or no.";
  if (!fields.firstName) errors.firstName = "Enter your first name.";
  if (!fields.lastName) errors.lastName = "Enter your last name.";
  if (!fields.businessName) errors.businessName = "Enter your business name.";
  if (!isEmail(fields.email)) errors.email = "Enter a valid email.";
  if (!isPhone(fields.phone)) errors.phone = "Enter a valid phone number.";
  if (Object.keys(errors).length) return json(422, { error: "Please check the highlighted fields.", fields: errors });

  const attribution = {};
  for (const key of ATTRIBUTION_KEYS) {
    const value = clean(body.attribution?.[key], 300);
    if (value) attribution[key] = value;
  }

  const known = verify(body.leadToken, "lead");
  let lead;
  try {
    ({ lead } = await db(event).upsertLead(fields, { leadId: known?.id, attribution }));
  } catch (error) {
    console.error("Lead save failed:", error);
    return json(500, { error: "We couldn't save your details. Please try again." });
  }
  if (!lead) return json(500, { error: "We couldn't save your details. Please try again." });

  // Keep the Google Sheet copy in sync (best effort, never blocks the visitor).
  await forwardPipelineRecord({
    leadId: lead.leadId, intent: "strategy_call", status: lead.status, submittedAt: lead.updatedAt,
    name: `${lead.firstName} ${lead.lastName}`, business: lead.businessName, email: lead.email, phone: lead.phone,
    trade: lead.profession === "Other Contractor / Home Service" ? lead.professionOther : lead.profession,
    service: lead.primaryService, serviceArea: lead.serviceArea, hasWebsite: lead.hasWebsite, website: lead.websiteUrl,
    adBudget: lead.adBudget, source: "book-page", campaign: lead.attribution
  });

  return json(200, {
    ok: true,
    leadId: lead.leadId,
    leadToken: sign("lead", lead.leadId),
    status: lead.status,
    summary: { firstName: lead.firstName, lastName: lead.lastName, businessName: lead.businessName, email: lead.email, phone: lead.phone }
  });
};
