// Confirms with Stripe (server-side, secret key) that a Contractor Lead System
// deposit actually succeeded for the correct amount. The browser only fires the
// `deposit_paid` analytics event after this returns verified: true.

const { LEAD_SYSTEM, clean, forwardPipelineRecord, json, parseBody, stripeRequest } = require("./_lead-system");

function isVerifiedDeposit(intent) {
  return (
    intent &&
    intent.status === "succeeded" &&
    intent.amount === LEAD_SYSTEM.depositCents &&
    intent.amount_received === LEAD_SYSTEM.depositCents &&
    intent.currency === LEAD_SYSTEM.currency &&
    intent.metadata?.product === LEAD_SYSTEM.productKey &&
    intent.metadata?.payment_type === "deposit"
  );
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Use POST." });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return json(500, { error: "Payments are not configured yet." });

  const body = parseBody(event);
  const paymentIntentId = clean(body?.paymentIntentId, 80);
  if (!/^pi_[A-Za-z0-9]+$/.test(paymentIntentId)) {
    return json(400, { error: "Missing payment reference." });
  }

  let intent;
  try {
    intent = await stripeRequest("GET", `payment_intents/${encodeURIComponent(paymentIntentId)}`, secretKey);
  } catch (error) {
    console.error("Deposit verification lookup failed:", error.message);
    return json(502, { verified: false, error: "We couldn't confirm the payment yet." });
  }

  if (intent.status === "processing") {
    return json(200, { verified: false, status: "processing" });
  }
  if (!isVerifiedDeposit(intent)) {
    return json(200, { verified: false, status: intent.status });
  }

  // Idempotent on the sheet side (rows are updated by email).
  await forwardPipelineRecord({
    updateEmail: intent.metadata.email || intent.receipt_email || "",
    leadId: intent.metadata.lead_id || "",
    status: "DEPOSIT_PAID",
    paymentIntentId: intent.id,
    amountCents: intent.amount_received
  });

  return json(200, {
    verified: true,
    status: intent.status,
    paymentIntentId: intent.id,
    leadId: intent.metadata.lead_id || "",
    amount: intent.amount_received,
    projectTotal: LEAD_SYSTEM.projectTotalCents,
    balance: LEAD_SYSTEM.balanceCents,
    currency: intent.currency
  });
};

exports.isVerifiedDeposit = isVerifiedDeposit;
