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

function requestOrigin(event) {
  const headers = event.headers || {};
  const proto = String(headers["x-forwarded-proto"] || headers["X-Forwarded-Proto"] || "https").split(",")[0].trim() || "https";
  const host = String(headers["x-forwarded-host"] || headers["X-Forwarded-Host"] || headers.host || headers.Host || "").split(",")[0].trim();
  if (!host) return "https://nexusluma.com";
  return `${proto}://${host}`;
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

  const origin = requestOrigin(event);
  const successUrl = `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${origin}/#analyzer`;

  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("success_url", successUrl);
  params.set("cancel_url", cancelUrl);
  params.set("customer_email", metadata.email);
  params.append("line_items[0][price_data][currency]", "usd");
  params.append("line_items[0][price_data][product_data][name]", "Website Improvement Starter Package");
  params.append("line_items[0][price_data][unit_amount]", "9900");
  params.append("line_items[0][quantity]", "1");
  params.append("payment_method_types[]", "card");
  params.set("client_reference_id", [metadata.email, metadata.website_url].filter(Boolean).join("|").slice(0, 200));
  Object.entries(metadata).forEach(([key, value]) => params.set(`metadata[${key}]`, value));

  try {
    const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
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

    return json(200, { checkoutUrl: payload.url, sessionId: payload.id });
  } catch (error) {
    return json(500, { error: "Unable to start payment.", details: error.message });
  }
};
