// Stripe webhook: the authoritative record that a Lead System deposit was paid,
// even if the visitor closes the browser before the thank-you screen.
// Idempotent: Stripe retries map to the same payments/{paymentIntent} record,
// so they never create a second payment or project.
// Configure in Stripe → Developers → Webhooks with the event
// payment_intent.succeeded, pointing to
// /api/stripe-webhook, and set STRIPE_WEBHOOK_SECRET.

const crypto = require("crypto");
const { LEAD_SYSTEM, forwardPipelineRecord, isVerifiedDeposit, json } = require("../_lead-system");
const { db } = require("./_db");
const { markPaid } = require("./project-api");

const TOLERANCE_SECONDS = 300;

function verifySignature(rawBody, header, secret, now = Math.floor(Date.now() / 1000)) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(
    String(header).split(",").map((item) => {
      const index = item.indexOf("=");
      return [item.slice(0, index).trim(), item.slice(index + 1).trim()];
    }).filter(([key]) => key === "t")
  );
  const signatures = String(header)
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.startsWith("v1="))
    .map((item) => item.slice(3));
  const timestamp = Number(parts.t);
  if (!timestamp || !signatures.length) return false;
  if (Math.abs(now - timestamp) > TOLERANCE_SECONDS) return false;

  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const expectedBuffer = Buffer.from(expected);
  return signatures.some((signature) => {
    const provided = Buffer.from(signature);
    return provided.length === expectedBuffer.length && crypto.timingSafeEqual(provided, expectedBuffer);
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Use POST." });

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return json(500, { error: "Webhook secret not configured." });

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64").toString("utf8")
    : event.body || "";
  const headers = event.headers || {};
  const signature = headers["stripe-signature"] || headers["Stripe-Signature"];

  if (!verifySignature(rawBody, signature, secret)) {
    return json(400, { error: "Invalid signature." });
  }

  let stripeEvent;
  try {
    stripeEvent = JSON.parse(rawBody);
  } catch {
    return json(400, { error: "Invalid payload." });
  }

  const intent = stripeEvent?.data?.object;
  if (intent?.object !== "payment_intent" || intent.metadata?.product !== LEAD_SYSTEM.productKey) {
    return json(200, { received: true, ignored: true });
  }

  if (stripeEvent.type === "payment_intent.succeeded" && isVerifiedDeposit(intent, intent.metadata?.project_id)) {
    const repo = db(event);
    const project = intent.metadata?.project_id ? await repo.getProject(intent.metadata.project_id) : null;
    if (project) {
      await markPaid(repo, project, await repo.getLead(project.leadId), intent);
    }
    await forwardPipelineRecord({
      updateEmail: intent.metadata.email || intent.receipt_email || "",
      leadId: intent.metadata.lead_id || "",
      status: "DEPOSIT_PAID",
      paymentIntentId: intent.id,
      amountCents: intent.amount_received
    });
  }
  // Failed attempts are intentionally not written to the sheet: events can
  // arrive out of order and must never overwrite a later DEPOSIT_PAID.

  return json(200, { received: true });
};

exports.verifySignature = verifySignature;
