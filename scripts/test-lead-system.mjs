// Funnel tests: qualification -> booking -> project -> payment -> onboarding.
// Google Calendar, Zoom, Stripe and webhooks are simulated in memory, so no
// network calls or real charges happen. Run: npm test
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const fn = (name) => require(`../netlify/functions/${name}.js`);
const shared = fn("_shared");

// ---- simulated Google Calendar ------------------------------------------
const calendar = { events: new Map(), seq: 0 };
shared.createCalendarClient = () => ({
  freebusy: {
    query: async ({ requestBody }) => {
      const id = requestBody.items[0].id;
      const busy = [...calendar.events.values()]
        .filter((e) => e.start < requestBody.timeMax && e.end > requestBody.timeMin)
        .map((e) => ({ start: e.start, end: e.end }));
      return { data: { calendars: { [id]: { busy } } } };
    }
  },
  events: {
    insert: async ({ requestBody }) => {
      await new Promise((r) => setTimeout(r, 15)); // make races realistic
      const id = `evt${++calendar.seq}`;
      calendar.events.set(id, { id, start: requestBody.start.dateTime, end: requestBody.end.dateTime, attendees: requestBody.attendees, description: requestBody.description });
      return { data: { id } };
    },
    delete: async ({ eventId }) => { calendar.events.delete(eventId); return {}; }
  }
});

// ---- simulated Stripe + outbound webhooks -------------------------------
let intents = new Map();
let outbound = [];
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const res = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
  outbound.push({ url: u, method: init.method || "GET", body: init.body });
  if (u === "https://api.stripe.com/v1/payment_intents" && init.method === "POST") {
    const p = new URLSearchParams(init.body);
    const metadata = {};
    for (const [k, v] of p) { const m = /^metadata\[(.+)\]$/.exec(k); if (m) metadata[m[1]] = v; }
    const id = `pi_test${intents.size + 1}`;
    const intent = { id, object: "payment_intent", client_secret: `${id}_secret`, amount: Number(p.get("amount")), amount_received: 0, currency: p.get("currency"), status: "requires_payment_method", metadata };
    intents.set(id, intent);
    return res(200, intent);
  }
  const m = /^https:\/\/api\.stripe\.com\/v1\/payment_intents\/(.+)$/.exec(u);
  if (m) return intents.has(m[1]) ? res(200, intents.get(m[1])) : res(404, { error: { message: "No such intent" } });
  return res(200, { ok: true }); // sheets, email, etc.
};

const post = (body, headers = {}) => ({ httpMethod: "POST", body: JSON.stringify(body), headers });
const get = (q, headers = {}) => ({ httpMethod: "GET", queryStringParameters: q, headers });
const parse = (r) => JSON.parse(r.body);
const repo = () => fn("_db").db({});

function nextWeekday(offsetDays = 2) {
  const d = new Date(); d.setDate(d.getDate() + offsetDays);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}
const DATE = nextWeekday(2);
const slots = () => shared.buildSlots(DATE);

const QUAL = {
  profession: "Roofing", primaryService: "Roof replacement", serviceArea: "Charlotte, NC",
  hasWebsite: "yes", websiteUrl: "smithroofing.com", adBudget: "$500–$1,000",
  firstName: "John", lastName: "Smith", businessName: "Smith Roofing", email: "John@SmithRoofing.com", phone: "(704) 555-0100",
  attribution: { utm_source: "google", utm_medium: "cpc", utm_campaign: "roofing-charlotte", utm_term: "roof replacement near me", gclid: "Cj0KCQ-test", landingPage: "https://www.nexusluma.com/?gclid=Cj0KCQ-test" }
};

async function qualify(overrides = {}) {
  const r = await fn("submit-qualification").handler(post({ ...QUAL, ...overrides }));
  assert.equal(r.statusCode, 200, r.body);
  return parse(r);
}
async function book(leadToken, start, extra = {}) {
  return fn("book-call").handler(post({ action: "book", leadToken, date: DATE, start, timezone: "America/Chicago", ...extra }));
}
async function adminToken() {
  return parse(await fn("admin-api").handler(post({ action: "login", password: process.env.ADMIN_PASSWORD }))).token;
}

beforeEach(() => {
  globalThis.__nlMemoryDb = undefined;
  calendar.events.clear();
  intents = new Map();
  outbound = [];
  Object.assign(process.env, {
    FUNNEL_SECRET: "test-secret-for-funnel-tokens",
    ADMIN_PASSWORD: "correct horse battery staple",
    STRIPE_SECRET_KEY: "sk_test_abc", STRIPE_PUBLISHABLE_KEY: "pk_test_xyz",
    GOOGLE_CLIENT_ID: "x", GOOGLE_CLIENT_SECRET: "x", GOOGLE_REFRESH_TOKEN: "x", GOOGLE_CALENDAR_ID: "primary",
    STRIPE_WEBHOOK_SECRET: "whsec_test"
  });
  for (const k of ["LEAD_SYSTEM_WEBHOOK_URL", "RESEND_API_KEY", "ZOOM_ACCOUNT_ID", "ZOOM_MEETING_URL", "CLIENT_LEADS_WEBHOOK_URL", "CLIENT_LEAD_ALLOWED_CLIENTS", "LEAD_SYSTEM_MANAGEMENT_ENABLED", "STRIPE_MANAGEMENT_PRICE_ID"]) delete process.env[k];
});

// ---------------------------------------------------------------------------

test("pricing is $799 total, $275 deposit, $524 balance", () => {
  const { LEAD_SYSTEM } = fn("_lead-system");
  assert.deepEqual([LEAD_SYSTEM.projectTotalCents, LEAD_SYSTEM.depositCents, LEAD_SYSTEM.balanceCents], [79900, 27500, 52400]);
});

test("no pre-call payment: old deposit endpoints are gone and /start, /questionnaire redirect to /book", () => {
  assert.equal(fs.existsSync("netlify/functions/create-lead-system-deposit.js"), false);
  assert.equal(fs.existsSync("netlify/functions/verify-lead-system-deposit.js"), false);
  const toml = fs.readFileSync("netlify.toml", "utf8");
  assert.match(toml, /from = "\/start\/\*"\s+to = "\/book\/"/);
  assert.match(toml, /from = "\/questionnaire\/\*"\s+to = "\/book\/"/);
  const home = fs.readFileSync("index.html", "utf8");
  assert.ok(!home.includes('href="/start/'), "homepage links to the old paid funnel");
  assert.ok(!/Start My Project — \$275<\/a>/.test(home), "homepage offers payment before the call");
});

test("qualification saves ONE lead before scheduling, with attribution", async () => {
  const out = await qualify();
  assert.match(out.leadId, /^lead_/);
  const lead = await repo().getLead(out.leadId);
  assert.equal(lead.status, "QUALIFIED_FORM_COMPLETED");
  assert.equal(lead.email, "john@smithroofing.com");
  assert.equal(lead.websiteUrl, "https://smithroofing.com");
  assert.equal(lead.attribution.gclid, "Cj0KCQ-test");
  assert.equal(lead.attribution.utm_term, "roof replacement near me");
  assert.deepEqual(lead.statusHistory.map((h) => h.status), ["NEW", "QUALIFIED_FORM_COMPLETED"]);
});

test("validation: required fields, Other needs a description", async () => {
  const r = await fn("submit-qualification").handler(post({ ...QUAL, profession: "Other Contractor / Home Service", phone: "123" }));
  assert.equal(r.statusCode, 422);
  assert.ok(parse(r).fields.professionOther && parse(r).fields.phone);
  assert.equal((await repo().listLeads()).length, 0);
});

test("re-submitting (back button, refresh, new session) never duplicates the lead", async () => {
  const a = await qualify();
  const b = await qualify({ primaryService: "Storm damage" });            // same email, no token
  const c = await qualify({ leadToken: a.leadToken, primaryService: "Storm damage", phone: "704-555-0199" }); // with token
  assert.equal(a.leadId, b.leadId);
  assert.equal(a.leadId, c.leadId);
  const leads = await repo().listLeads();
  assert.equal(leads.length, 1);
  assert.equal(leads[0].primaryService, "Storm damage");
  assert.equal(leads[0].phone, "704-555-0199");
  assert.equal(leads[0].attribution.gclid, "Cj0KCQ-test", "first-touch attribution kept");
});

test("booking uses the saved lead (no re-entry) and links booking -> lead", async () => {
  const q = await qualify();
  const start = await fn("book-call").handler(post({ action: "start", leadToken: q.leadToken }));
  assert.equal(parse(start).summary.email, "john@smithroofing.com");
  assert.equal((await repo().getLead(q.leadId)).status, "BOOKING_STARTED");

  const slot = slots()[3];
  const r = await book(q.leadToken, slot.start); // request carries NO name/email/phone
  assert.equal(r.statusCode, 200, r.body);
  const out = parse(r);
  const lead = await repo().getLead(q.leadId);
  const booking = await repo().getBooking(out.booking.bookingId);
  assert.equal(lead.status, "CALL_BOOKED");
  assert.equal(booking.leadId, q.leadId);
  assert.equal(booking.timezone, "America/Chicago");
  assert.equal(booking.meetingProvider, "zoom");
  const evt = [...calendar.events.values()][0];
  assert.equal(evt.attendees[0].email, "john@smithroofing.com");
  assert.match(evt.description, /Wants more: Roof replacement/);
  assert.match(evt.description, new RegExp(q.leadId));
});

test("double-click on the same time creates exactly one booking", async () => {
  const q = await qualify();
  const slot = slots()[2];
  const [r1, r2] = await Promise.all([book(q.leadToken, slot.start), book(q.leadToken, slot.start)]);
  assert.equal(r1.statusCode, 200, r1.body);
  assert.equal(r2.statusCode, 200, r2.body);
  assert.equal(parse(r1).booking.bookingId, parse(r2).booking.bookingId);
  assert.equal(calendar.events.size, 1);
});

test("two different people cannot book the same slot", async () => {
  const a = await qualify();
  const b = await qualify({ email: "jane@janehvac.com", businessName: "Jane HVAC", profession: "HVAC" });
  const slot = slots()[4];
  const [ra, rb] = await Promise.all([book(a.leadToken, slot.start), book(b.leadToken, slot.start)]);
  const codes = [ra.statusCode, rb.statusCode].sort();
  assert.deepEqual(codes, [200, 409]);
  assert.equal(calendar.events.size, 1);
});

test("only real availability: off-grid, past, busy, or unconfigured calendar is rejected", async () => {
  const q = await qualify();
  assert.equal((await book(q.leadToken, `${DATE}T13:07:00.000Z`)).statusCode, 409, "off-grid time");
  const past = await fn("book-call").handler(post({ action: "book", leadToken: q.leadToken, date: "2020-01-06", start: "2020-01-06T14:00:00.000Z" }));
  assert.equal(past.statusCode, 409);
  calendar.events.set("busy", { id: "busy", start: slots()[5].start, end: slots()[5].end });
  assert.equal((await book(q.leadToken, slots()[5].start)).statusCode, 409, "busy in Google Calendar");
  delete process.env.GOOGLE_REFRESH_TOKEN;
  const r = await book(q.leadToken, slots()[6].start);
  assert.equal(r.statusCode, 503);
  assert.ok(parse(r).schedulerUrl);
});

test("one active call per lead; reschedule swaps it; cancel frees the slot", async () => {
  const q = await qualify();
  const first = parse(await book(q.leadToken, slots()[1].start));
  const again = await book(q.leadToken, slots()[7].start);
  assert.equal(again.statusCode, 409);
  assert.equal(parse(again).alreadyBooked, true);

  const moved = await book(q.leadToken, slots()[7].start, { replaceBookingToken: first.bookingToken });
  assert.equal(moved.statusCode, 200, moved.body);
  const old = await repo().getBooking(first.booking.bookingId);
  assert.equal(old.status, "CANCELLED");
  assert.equal(calendar.events.size, 1);
  assert.equal((await repo().getLead(q.leadId)).status, "CALL_BOOKED");

  const view = parse(await fn("manage-booking").handler(get({ t: parse(moved).bookingToken })));
  assert.equal(view.booking.status, "BOOKED");
  const cancelled = await fn("manage-booking").handler(post({ t: parse(moved).bookingToken, action: "cancel" }));
  assert.equal(parse(cancelled).booking.status, "CANCELLED");
  assert.equal(calendar.events.size, 0);
  assert.equal((await repo().getLead(q.leadId)).status, "BOOKING_STARTED");
  const other = await qualify({ email: "x@y.com", businessName: "Other Co" });
  assert.equal((await book(other.leadToken, slots()[7].start)).statusCode, 200, "freed slot is bookable");
});

test("tokens are scoped: a lead or booking token cannot open a project", async () => {
  const q = await qualify();
  const r = await fn("project-api").handler(get({ t: q.leadToken }));
  assert.equal(r.statusCode, 401);
  assert.equal((await fn("project-api").handler(post({ t: "garbage", action: "checkout" }))).statusCode, 401);
});

test("admin auth required; wrong password rejected", async () => {
  assert.equal((await fn("admin-api").handler(get({ action: "leads" }))).statusCode, 401);
  assert.equal((await fn("admin-api").handler(post({ action: "login", password: "nope" }))).statusCode, 401);
  const token = await adminToken();
  const list = parse(await fn("admin-api").handler(get({ action: "leads" }, { authorization: `Bearer ${token}` })));
  assert.ok(Array.isArray(list.leads));
});

test("post-call: project link -> $275 payment -> verified -> onboarding, all on the same lead", async () => {
  const q = await qualify();
  await book(q.leadToken, slots()[2].start);
  const auth = { authorization: `Bearer ${await adminToken()}` };
  await fn("admin-api").handler(post({ action: "status", leadId: q.leadId, status: "CALL_COMPLETED" }, auth));

  const s1 = parse(await fn("admin-api").handler(post({ action: "start-project", leadId: q.leadId }, auth)));
  const s2 = parse(await fn("admin-api").handler(post({ action: "start-project", leadId: q.leadId }, auth)));
  assert.equal(s1.projectId, s2.projectId, "one project per lead");
  assert.equal((await repo().getLead(q.leadId)).status, "DEPOSIT_SENT");
  const t = new URL(s1.link).searchParams.get("t");

  const summary = parse(await fn("project-api").handler(get({ t })));
  assert.deepEqual([summary.projectTotalCents, summary.depositCents, summary.balanceCents, summary.paid], [79900, 27500, 52400, false]);

  assert.equal((await fn("project-api").handler(post({ t, action: "onboarding", data: { services: "Roofs" } }))).statusCode, 403, "onboarding locked before payment");

  const c1 = parse(await fn("project-api").handler(post({ t, action: "checkout", amount: 100, depositCents: 1 })));
  assert.equal(c1.amount, 27500);
  const pi = intents.get(c1.paymentIntentId);
  assert.equal(pi.amount, 27500, "server-side amount, client amount ignored");
  assert.equal(pi.metadata.project_id, s1.projectId);
  assert.equal(pi.metadata.lead_id, q.leadId);
  assert.equal(pi.metadata.gclid, "Cj0KCQ-test", "attribution travels to payment");
  const c2 = parse(await fn("project-api").handler(post({ t, action: "checkout" })));
  assert.equal(c2.paymentIntentId, c1.paymentIntentId, "refresh reuses the same PaymentIntent");

  // Not paid yet -> not verified
  assert.equal(parse(await fn("project-api").handler(post({ t, action: "verify", paymentIntentId: pi.id }))).verified, false);

  Object.assign(pi, { status: "succeeded", amount_received: 27500 });
  const v = parse(await fn("project-api").handler(post({ t, action: "verify", paymentIntentId: pi.id })));
  assert.equal(v.verified, true);
  const project = await repo().getProject(s1.projectId);
  assert.equal(project.status, "DEPOSIT_PAID");
  assert.equal(project.leadId, q.leadId);
  assert.equal((await repo().getLead(q.leadId)).status, "DEPOSIT_PAID");

  const ob = await fn("project-api").handler(post({ t, action: "onboarding", data: { services: "Roof replacement\nGutters", brandColors: "Navy" },
    files: [{ name: "logo.png", type: "image/png", kind: "logo", base64: Buffer.from("png-bytes").toString("base64") }] }));
  assert.equal(ob.statusCode, 200, ob.body);
  assert.equal(parse(ob).filesSaved, 1);
  assert.equal((await repo().getLead(q.leadId)).status, "PROJECT_STARTED");
  assert.equal((await repo().listLeads()).length, 1, "still exactly one lead");
});

test("payment can't be verified against another project or for the wrong amount", async () => {
  const auth = { authorization: `Bearer ${await adminToken()}` };
  const a = await qualify();
  const b = await qualify({ email: "b@b.com", businessName: "B Co" });
  const la = parse(await fn("admin-api").handler(post({ action: "start-project", leadId: a.leadId }, auth)));
  const lb = parse(await fn("admin-api").handler(post({ action: "start-project", leadId: b.leadId }, auth)));
  const ta = new URL(la.link).searchParams.get("t"), tb = new URL(lb.link).searchParams.get("t");
  const ca = parse(await fn("project-api").handler(post({ t: ta, action: "checkout" })));
  Object.assign(intents.get(ca.paymentIntentId), { status: "succeeded", amount_received: 27500 });
  assert.equal(parse(await fn("project-api").handler(post({ t: tb, action: "verify", paymentIntentId: ca.paymentIntentId }))).verified, false);
  const cb = parse(await fn("project-api").handler(post({ t: tb, action: "checkout" })));
  Object.assign(intents.get(cb.paymentIntentId), { status: "succeeded", amount: 9900, amount_received: 9900 });
  assert.equal(parse(await fn("project-api").handler(post({ t: tb, action: "verify", paymentIntentId: cb.paymentIntentId }))).verified, false);
  assert.equal((await repo().getProject(lb.projectId)).depositPaidAt, null);
});

test("Stripe webhook retries + success page never duplicate payments or projects", async () => {
  const auth = { authorization: `Bearer ${await adminToken()}` };
  const q = await qualify();
  const link = parse(await fn("admin-api").handler(post({ action: "start-project", leadId: q.leadId }, auth))).link;
  const t = new URL(link).searchParams.get("t");
  const c = parse(await fn("project-api").handler(post({ t, action: "checkout" })));
  const pi = Object.assign(intents.get(c.paymentIntentId), { status: "succeeded", amount_received: 27500 });

  const payload = JSON.stringify({ type: "payment_intent.succeeded", data: { object: pi } });
  const sig = () => { const ts = Math.floor(Date.now() / 1000); return `t=${ts},v1=${crypto.createHmac("sha256", "whsec_test").update(`${ts}.${payload}`).digest("hex")}`; };
  const hook = () => fn("stripe-webhook").handler({ httpMethod: "POST", body: payload, headers: { "stripe-signature": sig() } });

  const results = await Promise.all([hook(), hook(), fn("project-api").handler(post({ t, action: "verify", paymentIntentId: pi.id })), hook()]);
  results.forEach((r) => assert.equal(r.statusCode, 200, r.body));
  assert.equal((await repo().listPayments()).length, 1);
  const projects = (await repo().store.list("projects/")).length;
  assert.equal(projects, 1);
  const payment = (await repo().listPayments())[0];
  assert.equal(payment.leadId, q.leadId);
  assert.equal(payment.attribution.gclid, "Cj0KCQ-test");

  const csv = (await fn("admin-api").handler(get({ action: "conversions" }, auth))).body;
  assert.match(csv, /"Cj0KCQ-test","Deposit Paid",".+","275.00","USD"/);
});

test("webhook rejects bad or stale signatures", async () => {
  const { verifySignature, handler } = fn("stripe-webhook");
  const payload = "{}";
  const ts = Math.floor(Date.now() / 1000);
  const good = crypto.createHmac("sha256", "whsec_test").update(`${ts}.${payload}`).digest("hex");
  assert.equal(verifySignature(payload, `t=${ts},v1=${good}`, "whsec_test"), true);
  assert.equal(verifySignature(payload, `t=${ts - 3600},v1=${good}`, "whsec_test", ts), false);
  assert.equal((await handler({ httpMethod: "POST", body: payload, headers: { "stripe-signature": "t=1,v1=00" } })).statusCode, 400);
});

test("client-site lead intake defaults to NEW and requires configuration", async () => {
  const { handler, normalizeLead } = fn("contractor-site-lead");
  assert.equal(normalizeLead({}).status, "NEW");
  const body = { clientId: "acme-roofing", name: "Pat D.", phone: "336-555-0103", service: "Roof repair", zip: "27408" };
  assert.equal((await handler(post(body))).statusCode, 503);
  process.env.CLIENT_LEADS_WEBHOOK_URL = "https://example.test/client";
  process.env.CLIENT_LEAD_ALLOWED_CLIENTS = "acme-roofing";
  assert.equal((await handler(post(body))).statusCode, 200);
});

test("optional management subscription is off by default and consent-gated", async () => {
  const { handler } = fn("create-management-subscription");
  assert.equal((await handler(post({ email: "a@b.co", consent: true }))).statusCode, 503);
  process.env.LEAD_SYSTEM_MANAGEMENT_ENABLED = "true";
  process.env.STRIPE_MANAGEMENT_PRICE_ID = "price_123";
  assert.equal((await handler(post({ email: "a@b.co" }))).statusCode, 422);
});
