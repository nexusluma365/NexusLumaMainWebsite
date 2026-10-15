// Tests for the Contractor Lead System functions. Stripe and webhooks are
// mocked (global fetch), so no network calls or real charges happen.
// Run: npm test
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const fn = (name) => require(`../netlify/functions/${name}.js`);

let calls = [];
let responder = () => ({ status: 200, body: {} });

globalThis.fetch = async (url, init = {}) => {
  const call = { url: String(url), method: init.method || "GET", body: init.body, headers: init.headers };
  calls.push(call);
  const { status, body } = responder(call);
  return {
    ok: status < 400,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  };
};

const post = (body, extra = {}) => ({ httpMethod: "POST", body: JSON.stringify(body), headers: {}, ...extra });
const parse = (res) => JSON.parse(res.body);

beforeEach(() => {
  calls = [];
  responder = () => ({ status: 200, body: {} });
  for (const key of Object.keys(process.env)) {
    if (/^(STRIPE_|LEAD_SYSTEM_|CLIENT_LEAD|VITE_STRIPE|NEXT_PUBLIC_STRIPE|GOOGLE_SCRIPT_URL)/.test(key)) delete process.env[key];
  }
});

test("pricing constants are $799 total, $275 deposit, $524 balance", () => {
  const { LEAD_SYSTEM } = fn("_lead-system");
  assert.equal(LEAD_SYSTEM.projectTotalCents, 79900);
  assert.equal(LEAD_SYSTEM.depositCents, 27500);
  assert.equal(LEAD_SYSTEM.balanceCents, 52400);
});

test("deposit charges 27500 server-side and ignores any client-sent amount", async () => {
  process.env.STRIPE_SECRET_KEY = "sk_test_abc";
  process.env.STRIPE_PUBLISHABLE_KEY = "pk_test_xyz";
  responder = () => ({ status: 200, body: { id: "pi_123", client_secret: "pi_123_secret_456" } });

  const res = await fn("create-lead-system-deposit").handler(
    post({ name: "Jane Roofer", email: "jane@example.com", amount: 100, price: 79900, depositCents: 1, leadId: "lead_1" })
  );
  assert.equal(res.statusCode, 200);
  const out = parse(res);
  assert.equal(out.amount, 27500);
  assert.equal(out.publishableKey, "pk_test_xyz");
  assert.equal(out.mode, "test");

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.stripe.com/v1/payment_intents");
  const params = new URLSearchParams(calls[0].body);
  assert.equal(params.get("amount"), "27500");
  assert.equal(params.get("currency"), "usd");
  assert.equal(params.get("metadata[product]"), "contractor-lead-system");
  assert.equal(params.get("metadata[project_total_cents]"), "79900");
  assert.equal(params.get("metadata[balance_cents]"), "52400");
  assert.equal(params.get("metadata[lead_id]"), "lead_1");
  assert.deepEqual(params.getAll("amount"), ["27500"], "exactly one amount, the server-side deposit");
});

test("deposit never pairs a test secret key with a live publishable key", async () => {
  process.env.STRIPE_SECRET_KEY = "sk_test_abc";
  process.env.STRIPE_PUBLISHABLE_KEY = "pk_live_nope";
  const res = await fn("create-lead-system-deposit").handler(post({ name: "Jane", email: "jane@example.com" }));
  assert.equal(res.statusCode, 500);
  assert.equal(calls.length, 0);
});

test("deposit rejects missing contact details before calling Stripe", async () => {
  process.env.STRIPE_SECRET_KEY = "sk_test_abc";
  process.env.STRIPE_PUBLISHABLE_KEY = "pk_test_xyz";
  const res = await fn("create-lead-system-deposit").handler(post({ name: "J", email: "nope" }));
  assert.equal(res.statusCode, 422);
  assert.equal(calls.length, 0);
});

test("deposit surfaces a friendly error when Stripe fails", async () => {
  process.env.STRIPE_SECRET_KEY = "sk_test_abc";
  process.env.STRIPE_PUBLISHABLE_KEY = "pk_test_xyz";
  responder = () => ({ status: 402, body: { error: { message: "Your card was declined." } } });
  const res = await fn("create-lead-system-deposit").handler(post({ name: "Jane", email: "jane@example.com" }));
  assert.equal(res.statusCode, 502);
  assert.match(parse(res).error, /secure checkout/);
});

const goodIntent = {
  id: "pi_ok",
  object: "payment_intent",
  status: "succeeded",
  amount: 27500,
  amount_received: 27500,
  currency: "usd",
  receipt_email: "jane@example.com",
  metadata: { product: "contractor-lead-system", payment_type: "deposit", email: "jane@example.com", lead_id: "lead_1" }
};

test("verify confirms a real $275 lead-system deposit and records it", async () => {
  process.env.STRIPE_SECRET_KEY = "sk_test_abc";
  responder = (call) => call.url.includes("api.stripe.com") ? { status: 200, body: goodIntent } : { status: 200, body: { ok: true } };
  const res = await fn("verify-lead-system-deposit").handler(post({ paymentIntentId: "pi_ok" }));
  const out = parse(res);
  assert.equal(out.verified, true);
  assert.equal(out.amount, 27500);
  assert.equal(out.balance, 52400);
  const sheetCall = calls.find((c) => !c.url.includes("api.stripe.com"));
  assert.ok(sheetCall, "pipeline record forwarded");
  assert.equal(JSON.parse(sheetCall.body).status, "DEPOSIT_PAID");
});

for (const [label, patch] of [
  ["old $99 amount", { amount: 9900, amount_received: 9900 }],
  ["unpaid intent", { status: "requires_payment_method", amount_received: 0 }],
  ["other product", { metadata: { product: "Digital Bundle Offer", payment_type: "deposit" } }]
]) {
  test(`verify rejects ${label}`, async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_abc";
    responder = () => ({ status: 200, body: { ...goodIntent, ...patch } });
    const res = await fn("verify-lead-system-deposit").handler(post({ paymentIntentId: "pi_ok" }));
    assert.equal(parse(res).verified, false);
    assert.equal(calls.length, 1, "nothing forwarded to the sheet");
  });
}

test("verify rejects malformed payment references", async () => {
  process.env.STRIPE_SECRET_KEY = "sk_test_abc";
  const res = await fn("verify-lead-system-deposit").handler(post({ paymentIntentId: "../customers" }));
  assert.equal(res.statusCode, 400);
  assert.equal(calls.length, 0);
});

test("stripe webhook verifies signatures", async () => {
  const { verifySignature, handler } = fn("stripe-webhook");
  const secret = "whsec_test";
  const payload = JSON.stringify({ type: "payment_intent.succeeded", data: { object: goodIntent } });
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");

  assert.equal(verifySignature(payload, `t=${t},v1=${sig}`, secret), true);
  assert.equal(verifySignature(payload, `t=${t},v1=${"0".repeat(64)}`, secret), false);
  assert.equal(verifySignature(payload, `t=${t - 3600},v1=${sig}`, secret, t), false, "stale");

  process.env.STRIPE_WEBHOOK_SECRET = secret;
  const bad = await handler({ httpMethod: "POST", body: payload, headers: { "stripe-signature": "t=1,v1=00" } });
  assert.equal(bad.statusCode, 400);
  const ok = await handler({ httpMethod: "POST", body: payload, headers: { "stripe-signature": `t=${t},v1=${sig}` } });
  assert.equal(ok.statusCode, 200);
  assert.equal(JSON.parse(calls.at(-1).body).status, "DEPOSIT_PAID");
});

test("qualification validates and forwards a structured record", async () => {
  process.env.LEAD_SYSTEM_WEBHOOK_URL = "https://example.test/hook";
  const { handler } = fn("submit-qualification");

  const invalid = await handler(post({ intent: "deposit", name: "J" }));
  assert.equal(invalid.statusCode, 422);
  assert.equal(calls.length, 0);

  const res = await handler(post({
    intent: "deposit", name: "Jane Roofer", business: "Top Roofing", email: "JANE@example.com", phone: "(336) 555-0101",
    trade: "Roofing", service: "Roof replacement", serviceArea: "Greensboro, NC", hasWebsite: "No",
    runningAds: "No, never", adBudget: "$500–$1,000", campaign: { utm_source: "google", gclid: "abc" }
  }));
  assert.equal(res.statusCode, 200);
  assert.match(parse(res).leadId, /^lead_/);
  const record = JSON.parse(calls[0].body);
  assert.equal(calls[0].url, "https://example.test/hook");
  assert.equal(record.email, "jane@example.com");
  assert.equal(record.status, "QUALIFIED");
  assert.equal(record.campaign.gclid, "abc");
});

test("qualification falls back to the legacy Leads sheet shape", async () => {
  const res = await fn("submit-qualification").handler(post({
    intent: "strategy_call", name: "Sam Sparks", business: "Sparks Electric", email: "sam@example.com", phone: "3365550102", trade: "Electrical"
  }));
  assert.equal(res.statusCode, 200);
  const legacy = JSON.parse(calls[0].body);
  assert.equal(legacy.name, "Sam Sparks");
  assert.match(legacy.goal, /Lead System \(strategy_call\)/);
  assert.match(legacy.goal, /Phone: 3365550102/);
});

test("qualification honeypot is accepted silently and not forwarded", async () => {
  const res = await fn("submit-qualification").handler(post({ company_url_confirm: "http://spam" }));
  assert.equal(res.statusCode, 200);
  assert.equal(calls.length, 0);
});

test("contractor site leads default to NEW and require configuration", async () => {
  const { handler, normalizeLead } = fn("contractor-site-lead");
  assert.equal(normalizeLead({}).status, "NEW");

  const body = { clientId: "acme-roofing", name: "John D.", phone: "336-555-0103", service: "Kitchen Remodel", zip: "27408", source: "google_ads", campaign: "kitchens" };
  const notConfigured = await handler(post(body));
  assert.equal(notConfigured.statusCode, 503);

  process.env.CLIENT_LEADS_WEBHOOK_URL = "https://example.test/client";
  process.env.CLIENT_LEAD_ALLOWED_CLIENTS = "acme-roofing";
  const ok = await handler(post(body));
  assert.equal(ok.statusCode, 200);
  const sent = JSON.parse(calls[0].body);
  assert.deepEqual(
    [sent.name, sent.phone, sent.service, sent.serviceArea, sent.source, sent.campaign, sent.status],
    ["John D.", "336-555-0103", "Kitchen Remodel", "27408", "google_ads", "kitchens", "NEW"]
  );
  assert.ok(sent.date);

  const unknown = await handler(post({ ...body, clientId: "someone-else" }));
  assert.equal(unknown.statusCode, 422);
});

test("management subscription is off by default and requires explicit consent", async () => {
  const { handler } = fn("create-management-subscription");
  process.env.STRIPE_SECRET_KEY = "sk_test_abc";
  assert.equal((await handler(post({ email: "a@b.co", consent: true }))).statusCode, 503);

  process.env.LEAD_SYSTEM_MANAGEMENT_ENABLED = "true";
  process.env.STRIPE_MANAGEMENT_PRICE_ID = "price_123";
  assert.equal((await handler(post({ email: "a@b.co" }))).statusCode, 422);
  assert.equal((await handler(post({ email: "a@b.co", consent: "yes" }))).statusCode, 422);
  assert.equal(calls.length, 0);

  responder = () => ({ status: 200, body: { url: "https://checkout.stripe.test/s" } });
  const ok = await handler(post({ email: "a@b.co", consent: true }));
  assert.equal(ok.statusCode, 200);
  assert.equal(new URLSearchParams(calls[0].body).get("mode"), "subscription");
});

test("booking a call marks the lead Call Booked in the pipeline sheet", async () => {
  const googleEnv = { GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret", GOOGLE_REFRESH_TOKEN: "token", GOOGLE_CALENDAR_ID: "primary" };
  Object.assign(process.env, googleEnv, { LEAD_SYSTEM_WEBHOOK_URL: "https://sheet.example/exec" });
  require.cache[require.resolve("googleapis")] = {
    exports: {
      google: {
        auth: { OAuth2: class { setCredentials() {} } },
        calendar: () => ({
          freebusy: { query: async () => ({ data: { calendars: { primary: { busy: [] } } } }) },
          events: { insert: async () => ({ data: { id: "evt_1", htmlLink: "https://calendar.google.com/event?eid=1" } }) }
        })
      }
    }
  };
  try {
    const res = await fn("create-booking").handler(post({
      email: "Jane@Example.com", fname: "Jane", lname: "Roofer", leadId: "lead_1", selectedDate: "2026-10-20",
      slotStart: "2026-10-20T14:00:00.000Z", slotEnd: "2026-10-20T14:30:00.000Z"
    }));
    assert.equal(res.statusCode, 200);
    assert.equal(parse(res).mode, "google");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://sheet.example/exec");
    assert.deepEqual(JSON.parse(calls[0].body), {
      updateEmail: "jane@example.com", leadId: "lead_1", status: "CALL_BOOKED",
      callStart: "2026-10-20T14:00:00.000Z", callEnd: "2026-10-20T14:30:00.000Z",
      eventLink: "https://calendar.google.com/event?eid=1"
    });
  } finally {
    for (const key of Object.keys(googleEnv)) delete process.env[key];
    delete require.cache[require.resolve("googleapis")];
  }
});

test("a hanging lead sheet never blocks the visitor (forwarding gives up after 6s)", async () => {
  process.env.LEAD_SYSTEM_WEBHOOK_URL = "https://sheet.example/exec";
  const realFetch = globalThis.fetch;
  let sawSignal = false;
  const keepAlive = setInterval(() => {}, 1000); // AbortSignal.timeout timers do not hold the event loop open
  globalThis.fetch = (url, init = {}) => new Promise((_, reject) => {
    sawSignal = Boolean(init.signal);
    init.signal?.addEventListener("abort", () => reject(init.signal.reason));
  });
  try {
    const started = Date.now();
    const res = await fn("submit-qualification").handler(post({
      intent: "strategy_call", name: "Jane Roofer", business: "Jane's Roofing", email: "jane@example.com",
      phone: "3365550100", trade: "Roofing"
    }));
    const elapsed = Date.now() - started;
    assert.equal(res.statusCode, 200);
    assert.match(parse(res).leadId, /^lead_/);
    assert.ok(sawSignal, "forward request carries an abort signal");
    assert.ok(elapsed >= 5900 && elapsed < 8000, `responded after ${elapsed}ms`);
  } finally {
    clearInterval(keepAlive);
    globalThis.fetch = realFetch;
  }
});

test("call slots are weekdays 10 AM-4 PM ET and busy calendar times are hidden", () => {
  const { buildSlots, isWeekday } = fn("_shared");
  const day = "2026-10-20"; // a Tuesday, during daylight time (ET = UTC-4)
  const labels = buildSlots(day).map((s) => s.label);
  assert.equal(labels[0], "10:00 AM");
  assert.equal(labels.at(-1), "3:30 PM", "last 30-minute call ends at 4:00 PM");
  assert.equal(labels.length, 12);
  assert.equal(buildSlots(day)[0].start, "2026-10-20T14:00:00.000Z");

  // A meeting 11:00-12:15 ET removes the 11:00, 11:30 and 12:00 slots only
  const busy = [{ start: "2026-10-20T15:00:00.000Z", end: "2026-10-20T16:15:00.000Z" }];
  const open = buildSlots(day, { busyIntervals: busy }).map((s) => s.label);
  assert.deepEqual(open.filter((l) => /^1[12]:/.test(l)), ["12:30 PM"]);
  assert.equal(open.length, 9);

  // Winter (standard time, ET = UTC-5) still starts at 10 AM local
  assert.equal(buildSlots("2026-12-15")[0].start, "2026-12-15T15:00:00.000Z");

  assert.equal(isWeekday("2026-10-17"), false, "Saturday");
  assert.equal(isWeekday("2026-10-18"), false, "Sunday");
  assert.equal(isWeekday("2026-10-19"), true, "Monday");
  assert.equal(isWeekday("2026-10-23"), true, "Friday");
});

test("booking rejects times outside 10 AM-4 PM ET, weekends, and the past", async () => {
  const book = (selectedDate, slotStart, slotEnd) =>
    fn("create-booking").handler(post({ email: "jane@example.com", selectedDate, slotStart, slotEnd }));
  assert.equal((await book("2030-10-22", "2030-10-22T13:00:00.000Z", "2030-10-22T13:30:00.000Z")).statusCode, 409, "9:00 AM");
  assert.equal((await book("2030-10-22", "2030-10-22T20:00:00.000Z", "2030-10-22T20:30:00.000Z")).statusCode, 409, "4:00 PM");
  assert.equal((await book("2030-10-22", "2030-10-22T14:00:00.000Z", "2030-10-22T15:00:00.000Z")).statusCode, 409, "wrong length");
  assert.equal((await book("2030-10-26", "2030-10-26T14:00:00.000Z", "2030-10-26T14:30:00.000Z")).statusCode, 409, "Saturday");
  assert.equal((await book("2020-10-20", "2020-10-20T14:00:00.000Z", "2020-10-20T14:30:00.000Z")).statusCode, 409, "past");
  const ok = await book("2030-10-22", "2030-10-22T19:30:00.000Z", "2030-10-22T20:00:00.000Z"); // 3:30 PM, no Google config -> mock
  assert.equal(ok.statusCode, 200);
  assert.equal(parse(ok).mode, "mock");
});

test("BOOKING_AVAILABLE_FROM closes booking before that date", async () => {
  process.env.BOOKING_AVAILABLE_FROM = "2030-10-21"; // a Monday
  try {
    const avail = async (date) => parse(await fn("check-availability").handler({ httpMethod: "GET", queryStringParameters: { date } }));
    const friday = await avail("2030-10-18");
    assert.deepEqual(friday.availableSlots, []);
    assert.equal(friday.availableFrom, "2030-10-21", "page learns where to start the day list");
    const monday = await avail("2030-10-21");
    assert.equal(monday.availableSlots.length, 12);
    assert.equal(monday.availableFrom, undefined);

    const book = (selectedDate, slotStart, slotEnd) =>
      fn("create-booking").handler(post({ email: "jane@example.com", selectedDate, slotStart, slotEnd }));
    assert.equal((await book("2030-10-18", "2030-10-18T14:00:00.000Z", "2030-10-18T14:30:00.000Z")).statusCode, 409);
    assert.equal((await book("2030-10-21", "2030-10-21T14:00:00.000Z", "2030-10-21T14:30:00.000Z")).statusCode, 200);

    process.env.BOOKING_AVAILABLE_FROM = "";
    assert.equal((await avail("2030-10-18")).availableSlots.length, 12, "no setting = normal weekdays");
  } finally {
    delete process.env.BOOKING_AVAILABLE_FROM;
  }
});
