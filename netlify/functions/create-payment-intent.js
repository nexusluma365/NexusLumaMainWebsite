function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store"
    },
    body: JSON.stringify(body)
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Use POST to start payment." });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return json(500, { error: "STRIPE_SECRET_KEY is not configured." });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid JSON request body." });
  }

  const email = String(body.email || "").slice(0, 120);
  const metadata = {
    product: "Website Strategy Call",
    source: "website-funnel-payment-form",
    name: String(body.name || "").slice(0, 120),
    business: String(body.business || "").slice(0, 120),
    email,
    website_url: String(body.url || "").slice(0, 240),
    goal: String(body.goal || "").slice(0, 120),
    budget: String(body.budget || "").slice(0, 80),
    timeline: String(body.timeline || "").slice(0, 80),
    audit_score: String(body.auditScore || "").slice(0, 12)
  };

  const params = new URLSearchParams();
  params.set("amount", "9900");
  params.set("currency", "usd");
  params.set("description", "Nexus Luma Website Strategy Call");
  params.set("receipt_email", email);
  params.append("payment_method_types[]", "card");
  Object.entries(metadata).forEach(([key, value]) => params.set(`metadata[${key}]`, value));

  try {
    const stripeResponse = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: {
        authorization: `Bearer ${secretKey}`,
        "content-type": "application/x-www-form-urlencoded"
      },
      body: params.toString()
    });

    const payload = await stripeResponse.json();
    if (!stripeResponse.ok) {
      return json(502, { error: payload.error?.message || "Stripe payment setup failed." });
    }

    return json(200, { clientSecret: payload.client_secret, paymentIntentId: payload.id });
  } catch (error) {
    return json(500, { error: "Unable to start payment.", details: error.message });
  }
};
