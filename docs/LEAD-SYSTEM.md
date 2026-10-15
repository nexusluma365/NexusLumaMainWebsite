# Contractor Lead System — funnel, data & operations

Nexus Luma's flagship offer: contractor website, landing pages, Google Search
Ads setup, lead capture, conversion tracking, and 30 days of campaign
management.

| | |
|---|---|
| Total project | **$799** |
| Deposit (after the call, via project link) | **$275** (`27500` cents, set server-side) |
| Remaining balance | **$524**, per project payment terms |
| Google Ads media spend | Separate, paid directly to Google |

**The strategy call is free. Nothing is charged before the Zoom call.**

## Funnel

```
Google search → / → "Book My Free Strategy Call" → /book/ form (≈1 min)
   → lead saved (QUALIFIED_FORM_COMPLETED) → pick a time (no re-entry)
   → /booked/ confirmation (CALL_BOOKED) → Zoom call
   → admin "Start Project & Get Link" (DEPOSIT_SENT) → /project/ $275 (DEPOSIT_PAID)
   → /onboarding/ (PROJECT_STARTED)
```

| Path | Purpose |
|---|---|
| `/` | Sales page. Every primary CTA → `/book/`. Nav: How It Works · What's Included · Our Work · FAQ · Industries ▾ (links pre-select the trade: `/book/?trade=Roofing`) · **Book A Free Call**. Analyzer is secondary. |
| `/book/` | One card: profession dropdown (+ "Other" text), service, area, website yes/no (+ URL), optional ad budget, first/last name, business, email, phone → **See Available Zoom Times**. The scheduling step shows only "Booking for …" and date/time buttons. Refresh resumes; back → edit → resubmit updates the same lead. |
| `/booked/?t=` | You're Booked: date, time, timezone, Zoom link, Google Calendar / .ics, reschedule, cancel, "What We'll Cover". |
| `/admin/` | Password login. Leads by status, search, **Call Brief**, status buttons (Call Completed, Qualified, No Show, Not Interested, any status), **Start Project & Get Link** (optionally emails it), **Export Paid Conversions (CSV)**. |
| `/project/?t=` | "Let's Get Your Lead System Started." $799 / $275 today / $524 → Stripe card form → server verification. |
| `/onboarding/?t=` | Unlocked after payment: business description, services, areas, hours, license, competitors, reviews link, logo + photos (≤4 MB), photo folder link, brand colors, domain, current site, preferences, Google Ads access. Drafts autosave locally. |
| `/start/`, `/questionnaire/` | Old paid pre-call funnels → **301 to `/book/`**. |

Config without code changes: `js/funnel-config.js` (`askAdBudget`, `daysToShow`).

## Data (Netlify Blobs, store `nl-crm`)

No setup needed on Netlify (`@netlify/blobs` is in `package.json`). One person
is one lead; everything else references it.

```
leads/{leadId}          profile, attribution (first-touch), status + history, bookingIds, activeBookingId, projectId
index/email/{hash}      email → leadId (prevents duplicates across sessions)
bookings/{bookingId}    leadId, start/end, visitor timezone, business timezone, meetingProvider, zoomJoinUrl, calendarEventId, status
slots/{startISO}        atomic slot lock (create-only) → no double booking
projects/{projectId}    leadId, pricing, pendingPaymentIntentId, depositPaidAt, onboarding (+ files)
payments/{pi_…}         projectId, leadId, amount, attribution (create-only) → webhook retries can't duplicate
uploads/{projectId}/…   onboarding files
```

Statuses: `NEW, QUALIFIED_FORM_COMPLETED, BOOKING_STARTED, CALL_BOOKED, CALL_COMPLETED, QUALIFIED, PROJECT_ACCEPTED, DEPOSIT_SENT, DEPOSIT_PAID, PROJECT_STARTED, NOT_INTERESTED, NO_SHOW`.
Automated steps only move a lead forward; admins can set any status.

Leads are also copied to the Google Sheet (`LEAD_SYSTEM_WEBHOOK_URL`, else the legacy "Leads" sheet) as a backup.

## Functions

| Endpoint | Purpose |
|---|---|
| `submit-qualification` | Validate + upsert the lead (match by signed lead token, then email). Returns a signed lead token. |
| `check-availability` (existing) | Real Google Calendar free/busy → 30-min weekday slots. |
| `book-call` | `start` → BOOKING_STARTED. `book` → slot must be on the grid, ≥1h away, free in Google Calendar, and win the slot lock; creates the Zoom meeting + calendar invite (attendee = saved lead email), saves booking, CALL_BOOKED, sends emails. Same-slot repeats return the same booking; one active call per lead; `replaceBookingToken` reschedules. |
| `manage-booking` | Details for `/booked/`, cancel (removes invite + Zoom, frees slot). |
| `admin-api` | Login, leads, lead detail/brief, status, start-project (one project per lead), conversions CSV. |
| `project-api` | Project summary, checkout (PaymentIntent for 27500 with project/lead/gclid metadata; reused on refresh), verify (server-side), onboarding. |
| `stripe-webhook` | Signature-verified `payment_intent.succeeded` → same idempotent "deposit paid" record. |

## Tracking & attribution

`js/nl-track.js` keeps first-touch UTM/GCLID/gbraid/wbraid + landing page +
referrer for 90 days in `localStorage`; it's saved on the lead, copied onto
the PaymentIntent metadata and the payment record.

Events: `landing_page_view, primary_cta_clicked, qualification_started, qualification_completed, booking_started, call_booked, deposit_checkout_started, deposit_paid, onboarding_started, onboarding_submitted` (+ `call_cancelled`, `deposit_payment_failed`).
`call_completed`, `project_accepted` and `deposit_link_sent` are recorded server-side as lead statuses (admin actions), not browser events.

Google Ads: use **call_booked** as the lead conversion; revenue comes only from
verified deposits. Admin → **Export Paid Conversions (CSV)** produces a file in
Google Ads' offline-conversion upload format (GCLID, "Deposit Paid", time, 275.00 USD).
No analytics provider is installed yet — add GTM/GA4 and these events flow through.

## Environment variables

| Variable | Needed for |
|---|---|
| `FUNNEL_SECRET` | Signing customer links + admin sessions (set a long random value) |
| `ADMIN_PASSWORD` | `/admin/` login (≥10 chars) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_CALENDAR_ID`, `GOOGLE_REDIRECT_URI` | Live availability + invites (existing) |
| `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET` | A unique Zoom meeting per booking (Server-to-Server OAuth, `meeting:write`) |
| `ZOOM_MEETING_URL` | Fallback standing meeting link |
| `RESEND_API_KEY`, `EMAIL_FROM`, `NOTIFY_EMAIL` | Branded confirmation + internal notifications (Google's invite email is sent regardless) |
| `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | Post-call deposit |
| `SITE_URL` | Links in emails (defaults to Netlify's `URL`) |

## Setup checklist

1. **Fix Google Calendar** (production currently falls back to the Zoom scheduler): in Google Cloud Console → OAuth consent screen, **publish the app to Production** (Testing-mode refresh tokens expire after 7 days), then open `/api/google-auth-callback`, approve, and paste the new refresh token into `GOOGLE_REFRESH_TOKEN`.
2. Set `FUNNEL_SECRET` and `ADMIN_PASSWORD`.
3. Zoom: create a Server-to-Server OAuth app (or set `ZOOM_MEETING_URL`).
4. Resend: verify your domain, set `RESEND_API_KEY`, `EMAIL_FROM`, `NOTIFY_EMAIL`.
5. Stripe webhook → `/api/stripe-webhook`, event `payment_intent.succeeded`.
6. Test with Stripe **test** keys on a deploy preview (4242 4242 4242 4242 / 4000 0000 0000 0002).

## Client lead tracking (unchanged)

Client contractor sites post to `/api/contractor-site-lead` → `google-apps-script/client-lead-tracker.gs` (one tab per client, NEW → CONTACTED → ESTIMATE SCHEDULED → WON / LOST).

## Legacy (not linked)

`index (1).html` (noindex), `create-payment-intent.js` / `create-upgrade-payment.js` ($99 legacy endpoints, no longer reachable from any page), digital-bundle upsell (`/checkout`, `/cart`, `/upsell`, separate product, untouched).
