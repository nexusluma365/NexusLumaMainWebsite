// Signed, expiring tokens used in customer links and the admin session.
//   lead    – lets /book/ schedule for the lead it just saved (no re-entry of details)
//   booking – /booked/ confirmation, cancel, reschedule
//   project – /project/ payment and /onboarding/
//   admin   – /admin/ session
// Secret: FUNNEL_SECRET. If unset, a key is derived from other server-only
// secrets so the funnel keeps working; set FUNNEL_SECRET explicitly.

const crypto = require("crypto");

const TTL_SECONDS = { lead: 60 * 60 * 24 * 30, booking: 60 * 60 * 24 * 120, project: 60 * 60 * 24 * 90, admin: 60 * 60 * 12 };

function secret() {
  if (process.env.FUNNEL_SECRET) return process.env.FUNNEL_SECRET;
  const seed = process.env.STRIPE_SECRET_KEY || process.env.GOOGLE_CLIENT_SECRET || process.env.ADMIN_PASSWORD;
  if (!seed) throw new Error("FUNNEL_SECRET is not configured.");
  return crypto.createHash("sha256").update("nexus-luma-funnel:" + seed).digest("hex");
}

const b64 = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
const unb64 = (s) => Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");

function sign(type, id, extra = {}) {
  const body = b64(JSON.stringify({ t: type, id, exp: Math.floor(Date.now() / 1000) + TTL_SECONDS[type], ...extra }));
  const sig = b64(crypto.createHmac("sha256", secret()).update(body).digest());
  return `${body}.${sig}`;
}

function verify(token, type) {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig) return null;
  const expected = b64(crypto.createHmac("sha256", secret()).update(body).digest());
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try { payload = JSON.parse(unb64(body)); } catch { return null; }
  if (payload.t !== type || !payload.id || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

module.exports = { sign, verify };
