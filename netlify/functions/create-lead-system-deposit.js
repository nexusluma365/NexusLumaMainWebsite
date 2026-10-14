// Creates the $275 deposit PaymentIntent for the Contractor Lead System.
// The amount comes from _lead-system.js only — any amount/price in the request
// body is ignored.

const {
  LEAD_SYSTEM,
  clean,
  isEmail,
  json,
  parseBody,
  publishableKeyFor,
  stripeMode,
  stripeRequest
} = require("./_lead-system");

const PAYMENT_SETUP_ERROR = "We couldn't start secure checkout. Please try again in a moment.";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Use POST to start checkout." });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return json(500, { error: "Payments are not configured yet." });
  }

  const publishableKey = publishableKeyFor(secretKey);
  if (!publishableKey) {
    console.error(`No ${stripeMode(secretKey)}-mode Stripe publishable key is configured.`);
    return json(500, { error: "Payments are not configured yet." });
  }

  const body = parseBody(event);
  if (!body) return json(400, { error: "Invalid JSON request body." });

  const email = clean(body.email, 160).toLowerCase();
  const name = clean(body.name, 120);
  if (!isEmail(email) || name.length < 2) {
    return json(422, { error: "Please enter your name and a valid email." });
  }

  const metadata = {
    product: LEAD_SYSTEM.productKey,
    payment_type: "deposit",
    project_total_cents: String(LEAD_SYSTEM.projectTotalCents),
    deposit_cents: String(LEAD_SYSTEM.depositCents),
    balance_cents: String(LEAD_SYSTEM.balanceCents),
    lead_id: clean(body.leadId, 80),
    name,
    email,
    phone: clean(body.phone, 40),
    business: clean(body.business, 160),
    trade: clean(body.trade, 80),
    service: clean(body.service, 160),
    service_area: clean(body.serviceArea, 160),
    ad_budget: clean(body.adBudget, 40),
    ad_spend_note: "Google Ads media spend is separate and paid by the client directly to Google."
  };

  const params = new URLSearchParams();
  params.set("amount", String(LEAD_SYSTEM.depositCents));
  params.set("currency", LEAD_SYSTEM.currency);
  params.set(
    "description",
    `Nexus Luma ${LEAD_SYSTEM.productName} — project deposit ($275 of $799; $524 remaining)`
  );
  params.set("receipt_email", email);
  params.append("payment_method_types[]", "card");
  Object.entries(metadata).forEach(([key, value]) => params.set(`metadata[${key}]`, value));

  try {
    const intent = await stripeRequest("POST", "payment_intents", secretKey, params);
    return json(200, {
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
      publishableKey,
      mode: stripeMode(secretKey),
      amount: LEAD_SYSTEM.depositCents,
      projectTotal: LEAD_SYSTEM.projectTotalCents,
      balance: LEAD_SYSTEM.balanceCents,
      currency: LEAD_SYSTEM.currency
    });
  } catch (error) {
    console.error("Lead system deposit setup failed:", error.message);
    return json(502, { error: PAYMENT_SETUP_ERROR });
  }
};
