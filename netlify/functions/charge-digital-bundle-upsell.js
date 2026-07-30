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

function decodeBase64url(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function verifyToken(token, secret) {
  const [encodedPayload, providedSignature] = String(token || "").split(".");
  if (!encodedPayload || !providedSignature) return null;

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  const expectedBuffer = Buffer.from(expectedSignature);
  const providedBuffer = Buffer.from(providedSignature);
  if (
    expectedBuffer.length !== providedBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    return null;
  }

  const payload = JSON.parse(decodeBase64url(encodedPayload));
  if (!payload.exp || Date.now() > Number(payload.exp)) return null;
  return payload;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Use POST to accept the bundle offer." });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const sessionSecret = process.env.UPSELL_SESSION_SECRET;
  if (!secretKey || !sessionSecret) {
    return json(500, { error: "Upsell payment configuration is missing." });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid JSON request body." });
  }

  let session;
  try {
    session = verifyToken(body.token, sessionSecret);
  } catch {
    return json(403, { error: "This bundle offer session is no longer valid." });
  }

  if (!session?.customerId || !session?.paymentMethodId) {
    return json(403, { error: "This bundle offer session is no longer valid." });
  }

  const params = new URLSearchParams();
  params.set("amount", "9700");
  params.set("currency", "usd");
  params.set("customer", session.customerId);
  params.set("payment_method", session.paymentMethodId);
  params.set("confirm", "true");
  params.set("off_session", "true");
  params.set("description", "Digital Bundle Offer");
  if (session.email) params.set("receipt_email", session.email);
  params.set("metadata[product]", "Digital Bundle Offer");
  params.set("metadata[source]", "rich-relationship-one-click-upsell");
  params.set("metadata[first_payment_intent_id]", String(session.firstPaymentIntentId || ""));

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
      console.error("Digital bundle upsell charge failed:", payload.error?.message || payload);
      return json(402, {
        error: "We could not charge the saved card. Please contact support or return home."
      });
    }

    return json(200, {
      paymentIntentId: payload.id,
      status: payload.status,
      amount: 9700,
      currency: "usd"
    });
  } catch (error) {
    console.error("Unable to charge digital bundle upsell:", error);
    return json(500, { error: "Unable to process the bundle offer." });
  }
};
