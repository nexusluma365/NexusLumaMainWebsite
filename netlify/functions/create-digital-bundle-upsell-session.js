const crypto = require("crypto");

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

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function signPayload(payload, secret) {
  const encodedPayload = base64url(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `${encodedPayload}.${signature}`;
}

async function stripeGet(path, secretKey) {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { authorization: `Bearer ${secretKey}` }
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error?.message || "Stripe request failed.");
  }
  return payload;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Use POST to create an upsell session." });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const sessionSecret = process.env.UPSELL_SESSION_SECRET;
  if (!secretKey || !sessionSecret) {
    return json(500, { error: "Upsell session configuration is missing." });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid JSON request body." });
  }

  try {
    let paymentIntent;
    if (body.paymentIntentId) {
      paymentIntent = await stripeGet(`payment_intents/${encodeURIComponent(body.paymentIntentId)}`, secretKey);
    } else if (body.checkoutSessionId) {
      const session = await stripeGet(`checkout/sessions/${encodeURIComponent(body.checkoutSessionId)}`, secretKey);
      if (!session.payment_intent) {
        return json(400, { error: "Checkout session has no payment intent." });
      }
      paymentIntent = await stripeGet(`payment_intents/${encodeURIComponent(session.payment_intent)}`, secretKey);
    } else {
      return json(400, { error: "Missing first payment reference." });
    }

    if (paymentIntent.status !== "succeeded") {
      return json(403, { error: "First payment has not been completed." });
    }
    if (!paymentIntent.customer || !paymentIntent.payment_method) {
      return json(409, {
        error: "The first payment did not save a reusable card. The one-click upsell cannot be shown."
      });
    }

    const expiresAt = Date.now() + 20 * 60 * 1000;
    const token = signPayload({
      customerId: paymentIntent.customer,
      paymentMethodId: paymentIntent.payment_method,
      email: paymentIntent.receipt_email || "",
      firstPaymentIntentId: paymentIntent.id,
      exp: expiresAt,
      nonce: crypto.randomBytes(16).toString("hex")
    }, sessionSecret);

    return json(200, {
      token,
      expiresAt,
      email: paymentIntent.receipt_email || ""
    });
  } catch (error) {
    console.error("Unable to create digital bundle upsell session:", error);
    return json(500, { error: "Unable to prepare the bundle offer." });
  }
};
