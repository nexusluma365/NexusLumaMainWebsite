// OPTIONAL ongoing Google Ads management after the included first 30 days.
// - Disabled unless LEAD_SYSTEM_MANAGEMENT_ENABLED=true and STRIPE_MANAGEMENT_PRICE_ID is set.
// - Requires explicit consent (consent: true) from the client.
// - Uses Stripe-hosted Checkout in subscription mode, which shows the recurring
//   price and billing interval before the client confirms. Nobody is enrolled
//   automatically and nothing is charged from this endpoint directly.

const { LEAD_SYSTEM, clean, isEmail, json, managementPlanConfig, parseBody, stripeRequest } = require("./_lead-system");

function requestOrigin(event) {
  const headers = event.headers || {};
  const proto = String(headers["x-forwarded-proto"] || "https").split(",")[0].trim() || "https";
  const host = String(headers["x-forwarded-host"] || headers.host || "").split(",")[0].trim();
  return host ? `${proto}://${host}` : "https://nexusluma.com";
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Use POST." });

  const plan = managementPlanConfig();
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!plan.enabled || !secretKey) {
    return json(503, { error: "Ongoing management enrollment is not open yet. Please contact us." });
  }

  const body = parseBody(event);
  if (!body) return json(400, { error: "Invalid JSON request body." });
  if (body.consent !== true) {
    return json(422, { error: "Please confirm you agree to the recurring monthly charge." });
  }

  const email = clean(body.email, 160).toLowerCase();
  if (!isEmail(email)) return json(422, { error: "Please enter a valid email." });

  const origin = requestOrigin(event);
  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.set("customer_email", email);
  params.set("line_items[0][price]", plan.priceId);
  params.set("line_items[0][quantity]", "1");
  params.set("success_url", `${origin}/start/?management=success`);
  params.set("cancel_url", `${origin}/start/?management=cancelled`);
  params.set("subscription_data[metadata][product]", `${LEAD_SYSTEM.productKey}-management`);
  params.set("subscription_data[metadata][lead_id]", clean(body.leadId, 80));
  params.set("subscription_data[metadata][consent_recorded_at]", new Date().toISOString());

  try {
    const session = await stripeRequest("POST", "checkout/sessions", secretKey, params);
    return json(200, { checkoutUrl: session.url });
  } catch (error) {
    console.error("Management subscription checkout failed:", error.message);
    return json(502, { error: "We couldn't start enrollment. Please contact us." });
  }
};
