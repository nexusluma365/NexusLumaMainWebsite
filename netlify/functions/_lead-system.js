// Shared configuration + helpers for the Contractor Lead System offer.
// Prices live here and ONLY here. The browser never sends an amount that we trust.

const crypto = require("crypto");

const LEAD_SYSTEM = Object.freeze({
  productKey: "contractor-lead-system",
  productName: "Contractor Lead Generation System",
  currency: "usd",
  projectTotalCents: 79900,
  depositCents: 27500,
  balanceCents: 52400
});

if (LEAD_SYSTEM.depositCents + LEAD_SYSTEM.balanceCents !== LEAD_SYSTEM.projectTotalCents) {
  throw new Error("Lead system pricing is inconsistent.");
}

// Optional ongoing Google Ads management after the included 30 days.
// Disabled until a Stripe recurring price is configured. Never auto-enrolls anyone.
function managementPlanConfig() {
  const priceId = process.env.STRIPE_MANAGEMENT_PRICE_ID || "";
  return {
    enabled: Boolean(priceId) && process.env.LEAD_SYSTEM_MANAGEMENT_ENABLED === "true",
    priceId,
    displayMonthly: process.env.LEAD_SYSTEM_MANAGEMENT_DISPLAY_PRICE || ""
  };
}

// Statuses for leads that arrive from a client's contractor website.
const CLIENT_LEAD_STATUSES = Object.freeze(["NEW", "CONTACTED", "ESTIMATE SCHEDULED", "WON", "LOST"]);

// Legacy Apps Script "Leads" sheet (also used by submit-lead.js). Public by design.
const LEGACY_LEADS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwFSCg833xZXupw09CkMRihS4hmyhFHzwBnkXQGeWDXCxMq9S0frgMUX5roA__fnNQ/exec";

const LIVE_PUBLISHABLE_KEY_FALLBACK =
  "pk_live_51TeycBPJOp8s8XsSjWLZD8n3JweuczqhYYgoJKLkiNfogQUnveNxlB3YMOM8GPrBAd8YCWYNXxVv4vKdgcoftxoR00IsTaLRDD";

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

function parseBody(event) {
  try {
    const parsed = JSON.parse(event.body || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function clean(value, max = 200) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function cleanMultiline(value, max = 2000) {
  return String(value ?? "")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, max);
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || ""));
}

function isPhone(value) {
  return String(value || "").replace(/\D/g, "").length >= 10;
}

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(4).toString("hex")}`;
}

function stripeMode(secretKey) {
  if (String(secretKey).startsWith("sk_test_") || String(secretKey).startsWith("rk_test_")) return "test";
  if (String(secretKey).startsWith("sk_live_") || String(secretKey).startsWith("rk_live_")) return "live";
  return "unknown";
}

// Return a publishable key whose mode matches the secret key, so a test
// secret key is never paired with a live publishable key (or vice versa).
function publishableKeyFor(secretKey) {
  const mode = stripeMode(secretKey);
  const candidates = [
    process.env.STRIPE_PUBLISHABLE_KEY,
    process.env.VITE_STRIPE_PUBLISHABLE_KEY,
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    process.env.STRIPE_PUBLIC_KEY
  ].filter(Boolean);
  const match = candidates.find((key) => key.startsWith(`pk_${mode}_`));
  if (match) return match;
  if (mode === "live") return LIVE_PUBLISHABLE_KEY_FALLBACK;
  return "";
}

async function stripeRequest(method, path, secretKey, params) {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      authorization: `Bearer ${secretKey}`,
      ...(params ? { "content-type": "application/x-www-form-urlencoded" } : {})
    },
    body: params ? params.toString() : undefined
  });
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `Stripe request failed (${response.status}).`);
    error.stripe = payload?.error;
    error.status = response.status;
    throw error;
  }
  return payload;
}

// Sends a lead/pipeline record to the configured sheet/CRM.
// LEAD_SYSTEM_WEBHOOK_URL receives the full structured record (see
// google-apps-script/lead-system-pipeline.gs). Without it, the record is
// mapped into the existing legacy "Leads" sheet so nothing is lost.
// Failures are logged and never thrown: lead forwarding must not break payment.
async function forwardPipelineRecord(record) {
  const target = process.env.LEAD_SYSTEM_WEBHOOK_URL;
  try {
    if (target) {
      const response = await fetch(target, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(record),
        redirect: "manual"
      });
      return { ok: response.status < 400, status: response.status };
    }

    const legacyUrl = process.env.GOOGLE_SCRIPT_URL || LEGACY_LEADS_SCRIPT_URL;
    const legacy = record.updateEmail
      ? { updateEmail: record.updateEmail, status: record.status, paymentIntentId: record.paymentIntentId || "" }
      : {
          name: record.name,
          email: record.email,
          business: record.business,
          url: record.website || "No website",
          goal: [
            `Lead System (${record.intent})`,
            record.trade && `Trade: ${record.trade}`,
            record.service && `Service: ${record.service}`,
            record.serviceArea && `Area: ${record.serviceArea}`,
            record.runningAds && `Ads: ${record.runningAds}`,
            record.phone && `Phone: ${record.phone}`,
            record.campaign?.utm_source && `Src: ${record.campaign.utm_source}/${record.campaign.utm_campaign || "-"}`,
            record.campaign?.gclid && "gclid: yes"
          ].filter(Boolean).join(" | "),
          budget: record.adBudget || "",
          timeline: record.notes || "",
          score: "",
          status: record.status,
          paymentIntentId: record.paymentIntentId || ""
        };
    const response = await fetch(legacyUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(legacy),
      redirect: "manual"
    });
    return { ok: response.status < 400, status: response.status, legacy: true };
  } catch (error) {
    console.error("Pipeline record forwarding failed:", error.message);
    return { ok: false, error: error.message };
  }
}

module.exports = {
  CLIENT_LEAD_STATUSES,
  LEAD_SYSTEM,
  clean,
  cleanMultiline,
  forwardPipelineRecord,
  isEmail,
  isPhone,
  json,
  managementPlanConfig,
  newId,
  parseBody,
  publishableKeyFor,
  stripeMode,
  stripeRequest
};
