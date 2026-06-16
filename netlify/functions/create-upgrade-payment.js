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

  const metadata = {
    product: "Website Improvement Starter Package",
    source: "website-audit-modal",
    first_name: String(body.firstName || "").slice(0, 80),
    last_name: String(body.lastName || "").slice(0, 80),
    email: String(body.email || "").slice(0, 120),
    website_url: String(body.url || "").slice(0, 240),
    audit_score: String(body.auditScore || "").slice(0, 12)
  };

  const params = new URLSearchParams();
  params.set("amount", "9900");
  params.set("currency", "usd");
  params.append("payment_method_types[]", "card");
  params.set("description", "Website Improvement Starter Package");
  params.set("receipt_email", metadata.email);
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

    return json(200, { clientSecret: payload.client_secret });
  } catch (error) {
    return json(500, { error: "Unable to start payment.", details: error.message });
  }
};
