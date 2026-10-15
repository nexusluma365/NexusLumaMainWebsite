// CRM data layer for the Contractor Lead System funnel.
//
// Production: Netlify Blobs (store "nl-crm", strong consistency). No setup is
// needed on Netlify. Strong consistency requires Functions v2, so the CRM
// endpoints are v2 entry points (../*.mjs) wrapping these handlers.
// Local/tests: an in-memory store with the same API (or a JSON file when
// NL_LOCAL_DB_FILE is set).
//
// Records (one person = one lead; everything else references lead_id):
//   leads/{leadId}            lead + attribution + status history
//   index/email/{hash}        email -> leadId (dedupe across sessions)
//   bookings/{bookingId}      booking -> leadId
//   slots/{startISO}          slot lock (created only-if-new => no double booking)
//   projects/{projectId}      project -> leadId
//   payments/{paymentIntent}  payment -> projectId, leadId (only-if-new => idempotent)
//   uploads/{projectId}/...   onboarding files

const crypto = require("crypto");
const fs = require("fs");

const STATUSES = Object.freeze([
  "NEW",
  "QUALIFIED_FORM_COMPLETED",
  "BOOKING_STARTED",
  "CALL_BOOKED",
  "CALL_COMPLETED",
  "QUALIFIED",
  "PROJECT_ACCEPTED",
  "DEPOSIT_SENT",
  "DEPOSIT_PAID",
  "PROJECT_STARTED",
  "NOT_INTERESTED",
  "NO_SHOW"
]);
const STATUS_RANK = Object.fromEntries(STATUSES.map((s, i) => [s, i]));
// Terminal-ish statuses an automated step must never overwrite.
const SIDE_STATUSES = new Set(["NOT_INTERESTED", "NO_SHOW"]);

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(5).toString("hex")}`;
}

function emailKey(email) {
  return "index/email/" + crypto.createHash("sha256").update(String(email).trim().toLowerCase()).digest("hex").slice(0, 40);
}

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------

function memoryStore() {
  const file = process.env.NL_LOCAL_DB_FILE;
  if (!globalThis.__nlMemoryDb) {
    let initial = {};
    if (file && fs.existsSync(file)) {
      try { initial = JSON.parse(fs.readFileSync(file, "utf8")); } catch { initial = {}; }
    }
    globalThis.__nlMemoryDb = new Map(Object.entries(initial));
  }
  const map = globalThis.__nlMemoryDb;
  const persist = () => { if (file) fs.writeFileSync(file, JSON.stringify(Object.fromEntries(map))); };
  let version = 0;
  return {
    async get(key) {
      const hit = map.get(key);
      return hit ? { value: JSON.parse(hit.value), etag: hit.etag } : null;
    },
    async set(key, value, { onlyIfNew, onlyIfMatch } = {}) {
      const existing = map.get(key);
      if (onlyIfNew && existing) return { modified: false };
      if (onlyIfMatch && (!existing || existing.etag !== onlyIfMatch)) return { modified: false };
      map.set(key, { value: JSON.stringify(value), etag: `m${++version}${Date.now()}` });
      persist();
      return { modified: true };
    },
    async delete(key) { map.delete(key); persist(); },
    async list(prefix) { return [...map.keys()].filter((k) => k.startsWith(prefix)); },
    async setBinary(key, buffer, contentType) {
      map.set(key, { value: JSON.stringify({ b64: Buffer.from(buffer).toString("base64"), contentType }), etag: `m${++version}` });
      persist();
    }
  };
}

function blobsStore(event) {
  const { connectLambda, getStore } = require("@netlify/blobs");
  if (event && event.blobs) connectLambda(event);
  const store = getStore({ name: "nl-crm", consistency: "strong" });
  return {
    async get(key) {
      const hit = await store.getWithMetadata(key, { type: "json" });
      return hit ? { value: hit.data, etag: hit.etag } : null;
    },
    async set(key, value, opts = {}) {
      const result = await store.setJSON(key, value, opts);
      return { modified: result ? result.modified !== false : true };
    },
    async delete(key) { await store.delete(key); },
    async list(prefix) {
      const { blobs } = await store.list({ prefix });
      return blobs.map((b) => b.key);
    },
    async setBinary(key, buffer, contentType) {
      await store.set(key, buffer, { metadata: { contentType } });
    }
  };
}

function db(event) {
  const onNetlify = Boolean((event && (event.blobs || event.__v2)) || process.env.NETLIFY_BLOBS_CONTEXT || globalThis.netlifyBlobsContext);
  const store = onNetlify ? blobsStore(event) : memoryStore();
  return createRepo(store);
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

function createRepo(store) {
  // Read-modify-write with optimistic concurrency (retries on conflict).
  async function update(key, mutate, attempts = 5) {
    for (let i = 0; i < attempts; i++) {
      const hit = await store.get(key);
      if (!hit) return null;
      const next = mutate(structuredClone(hit.value));
      if (!next) return hit.value;
      const { modified } = await store.set(key, next, { onlyIfMatch: hit.etag });
      if (modified) return next;
    }
    throw new Error(`Concurrent update conflict on ${key}`);
  }

  function applyStatus(lead, status, { force = false, note = "" } = {}) {
    if (!STATUSES.includes(status)) throw new Error(`Unknown status ${status}`);
    const current = lead.status || "NEW";
    // Automated steps only move a lead forward; admins can force any status.
    if (!force) {
      if (SIDE_STATUSES.has(current) && !["CALL_BOOKED", "DEPOSIT_PAID", "PROJECT_STARTED"].includes(status)) return false;
      if (!SIDE_STATUSES.has(status) && (STATUS_RANK[status] ?? 0) < (STATUS_RANK[current] ?? 0)) return false;
    }
    if (current === status) return false;
    lead.status = status;
    lead.statusHistory = [...(lead.statusHistory || []), { status, at: new Date().toISOString(), note }].slice(-50);
    lead.updatedAt = new Date().toISOString();
    return true;
  }

  return {
    store,
    STATUSES,

    async getLead(leadId) {
      const hit = await store.get(`leads/${leadId}`);
      return hit ? hit.value : null;
    },

    async findLeadIdByEmail(email) {
      const hit = await store.get(emailKey(email));
      return hit ? hit.value.leadId : null;
    },

    // Create or update ONE lead for this person. Matching order: the lead id
    // the browser already holds (signed), then email. Never creates a
    // duplicate for the same email.
    async upsertLead(fields, { leadId: knownLeadId, attribution } = {}) {
      const now = new Date().toISOString();
      let leadId = knownLeadId && (await this.getLead(knownLeadId)) ? knownLeadId : null;
      if (!leadId) leadId = await this.findLeadIdByEmail(fields.email);

      if (!leadId) {
        const candidate = newId("lead");
        const claim = await store.set(emailKey(fields.email), { leadId: candidate }, { onlyIfNew: true });
        leadId = claim.modified ? candidate : await this.findLeadIdByEmail(fields.email);
        if (claim.modified) {
          const lead = {
            leadId, createdAt: now, updatedAt: now, status: "NEW", statusHistory: [{ status: "NEW", at: now }],
            ...fields, attribution: attribution || {}, bookingIds: [], projectId: null
          };
          applyStatus(lead, "QUALIFIED_FORM_COMPLETED");
          await store.set(`leads/${leadId}`, lead, { onlyIfNew: true });
          return { lead, created: true };
        }
      }

      // If a parallel request just claimed this email, give its write a moment to land.
      if (!(await this.getLead(leadId))) await new Promise((r) => setTimeout(r, 400));
      const lead = await update(`leads/${leadId}`, (lead) => {
        const previousEmail = lead.email;
        Object.assign(lead, fields, { updatedAt: now });
        // Keep first-touch attribution; fill gaps (e.g. a later gclid).
        lead.attribution = { ...(attribution || {}), ...(lead.attribution || {}) };
        for (const [k, v] of Object.entries(attribution || {})) if (v && !lead.attribution[k]) lead.attribution[k] = v;
        if (attribution && attribution.gclid && attribution.gclid !== lead.attribution.gclid) lead.attribution.lastGclid = attribution.gclid;
        lead._emailChangedFrom = previousEmail !== lead.email ? previousEmail : undefined;
        applyStatus(lead, "QUALIFIED_FORM_COMPLETED");
        return lead;
      });
      if (lead && lead._emailChangedFrom) {
        await store.set(emailKey(lead.email), { leadId }, {});
        delete lead._emailChangedFrom;
      }
      return { lead, created: false };
    },

    async setLeadStatus(leadId, status, opts) {
      return update(`leads/${leadId}`, (lead) => (applyStatus(lead, status, opts) ? lead : null));
    },

    async patchLead(leadId, mutate) {
      return update(`leads/${leadId}`, mutate);
    },

    async listLeads() {
      const keys = await store.list("leads/");
      const leads = await Promise.all(keys.map(async (k) => (await store.get(k))?.value));
      return leads.filter(Boolean).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    },

    // --- bookings ---------------------------------------------------------
    // Atomic: only one booking can ever hold a slot.
    async lockSlot(startISO, bookingId, leadId) {
      const { modified } = await store.set(`slots/${startISO}`, { bookingId, leadId, at: new Date().toISOString() }, { onlyIfNew: true });
      if (modified) return { locked: true };
      const hit = await store.get(`slots/${startISO}`);
      return { locked: false, holder: hit ? hit.value : null };
    },
    async releaseSlot(startISO, bookingId) {
      const hit = await store.get(`slots/${startISO}`);
      if (hit && hit.value.bookingId === bookingId) await store.delete(`slots/${startISO}`);
    },
    async saveBooking(booking) {
      await store.set(`bookings/${booking.bookingId}`, booking, {});
      return booking;
    },
    async getBooking(bookingId) {
      const hit = await store.get(`bookings/${bookingId}`);
      return hit ? hit.value : null;
    },
    async patchBooking(bookingId, mutate) {
      return update(`bookings/${bookingId}`, mutate);
    },

    // --- projects & payments ---------------------------------------------
    async getProject(projectId) {
      const hit = await store.get(`projects/${projectId}`);
      return hit ? hit.value : null;
    },
    async createProjectForLead(leadId, pricing) {
      const lead = await this.getLead(leadId);
      if (!lead) throw new Error("Lead not found");
      if (lead.projectId) {
        const existing = await this.getProject(lead.projectId);
        if (existing) return { project: existing, created: false };
      }
      const now = new Date().toISOString();
      const project = {
        projectId: newId("proj"), leadId, createdAt: now, updatedAt: now, status: "DEPOSIT_SENT",
        ...pricing, paymentIntentId: null, depositPaidAt: null, onboarding: null, onboardingSubmittedAt: null
      };
      await store.set(`projects/${project.projectId}`, project, { onlyIfNew: true });
      const linked = await update(`leads/${leadId}`, (l) => {
        if (l.projectId) return null; // another request won the race
        l.projectId = project.projectId;
        applyStatus(l, "PROJECT_ACCEPTED", { force: true });
        applyStatus(l, "DEPOSIT_SENT", { force: true });
        return l;
      });
      if (linked && linked.projectId !== project.projectId) {
        await store.delete(`projects/${project.projectId}`);
        return { project: await this.getProject(linked.projectId), created: false };
      }
      return { project, created: true };
    },
    async patchProject(projectId, mutate) {
      return update(`projects/${projectId}`, mutate);
    },
    // Records a verified deposit exactly once, however many times it is
    // reported (success page, verify retries, Stripe webhook retries).
    async recordDepositPaid({ paymentIntentId, projectId, leadId, amountCents, currency, attribution }) {
      const now = new Date().toISOString();
      const payment = { paymentIntentId, projectId, leadId, amountCents, currency, paidAt: now, attribution: attribution || {} };
      const { modified } = await store.set(`payments/${paymentIntentId}`, payment, { onlyIfNew: true });
      await update(`projects/${projectId}`, (p) => {
        if (p.depositPaidAt) return null;
        p.status = "DEPOSIT_PAID";
        p.depositPaidAt = now;
        p.paymentIntentId = paymentIntentId;
        p.updatedAt = now;
        return p;
      });
      await update(`leads/${leadId}`, (l) => {
        if (l.status === "DEPOSIT_PAID" || l.status === "PROJECT_STARTED") return null;
        applyStatus(l, "DEPOSIT_PAID", { force: true, note: paymentIntentId });
        return l;
      });
      return { firstTime: modified, payment: modified ? payment : (await store.get(`payments/${paymentIntentId}`)).value };
    },
    async listPayments() {
      const keys = await store.list("payments/");
      return (await Promise.all(keys.map(async (k) => (await store.get(k))?.value))).filter(Boolean);
    }
  };
}

module.exports = { STATUSES, db, emailKey, newId, createRepo, memoryStore };
