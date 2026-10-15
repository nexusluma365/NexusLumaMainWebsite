# Contractor Lead System — architecture & operations

Nexus Luma's flagship offer: a contractor website, Google Search Ads setup,
conversion + lead tracking, and 30 days of campaign management.

| | |
|---|---|
| Total project price | **$799** |
| Deposit (charged online) | **$275** (`27500` cents) |
| Remaining balance | **$524**, per project payment terms |
| Google Ads media spend | **Separate.** Paid by the client directly to Google in their own Ads account. Never taken from the $799. |

All amounts live in one place: `netlify/functions/_lead-system.js`. The browser
never sends a price that the server trusts.

## Customer journey

```
Google search → homepage (/) → /start/ qualification → $275 deposit → onboarding
                     └──── secondary: /book/ strategy call
```

| Path | Purpose |
|---|---|
| `/` | Sales page. Primary CTA **Build My Lead System** → `/start/`. Secondary **Book A Strategy Call** → `/book/`. Website analyzer is a secondary lead magnet. |
| `/start/` | Short qualification (trade, service, area, website, ads, budget, contact) → project summary → Stripe card payment for the $275 deposit → server-verified success screen. Answers persist in `sessionStorage`. |
| `/book/` | Short form, then live Google Calendar slots (if configured) or the Zoom scheduler. |

## Functions

| Endpoint | What it does |
|---|---|
| `POST /api/submit-qualification` | Validates a `/start/` or `/book/` submission server-side, assigns a `leadId`, forwards it to the pipeline sheet. |
| `POST /api/create-booking` | Books the strategy call on Google Calendar and marks the lead `CALL_BOOKED` (call time + event link) in the pipeline sheet. |
| `POST /api/create-lead-system-deposit` | Creates a Stripe PaymentIntent for exactly **27500** (ignores any client amount). Metadata: `product=contractor-lead-system`, `payment_type=deposit`, totals, lead details. Returns a publishable key whose mode matches the secret key. |
| `POST /api/verify-lead-system-deposit` | Retrieves the PaymentIntent with the secret key; verified only if `succeeded`, amount/received = 27500, `usd`, and lead-system metadata. Marks the lead `DEPOSIT_PAID`. |
| `POST /api/stripe-webhook` | Signature-verified `payment_intent.succeeded` handler. Authoritative record if the visitor closes the browser before the success screen. |
| `POST /api/contractor-site-lead` | Intake for leads from **client** contractor websites (see below). |
| `POST /api/create-management-subscription` | Optional ongoing management. Off unless enabled; requires `consent: true`; uses Stripe-hosted subscription Checkout so recurring terms are shown before purchase. Not linked from the site yet. |

## Tracking events

`js/nl-track.js` exposes `nlTrack(event, data)`, pushes to `window.dataLayer`,
calls `gtag` if present, and captures first-touch UTM/GCLID into
`sessionStorage` (sent with qualification submissions). **No analytics provider
is installed yet** — add GTM or GA4 to the pages and these events flow through.

| Event | Fires when |
|---|---|
| `contractor_landing_view` | Homepage loads |
| `lead_system_cta_clicked` | Any primary CTA (`data-track-location` says which) |
| `qualification_started` | First answer on `/start/` |
| `qualification_completed` | Server accepted the qualification |
| `deposit_checkout_started` | "Start My Project" clicked |
| `deposit_payment_failed` | Stripe returned a card/payment error |
| `deposit_paid` | **Only after `/api/verify-lead-system-deposit` confirms** — never on a click |
| `strategy_call_clicked` | Book-a-call links, scheduler opened, or calendar slot confirmed |
| `strategy_call_booked` | `create-booking` created a real Google Calendar event (not fired in mock mode or for the external Zoom scheduler, which can't report back) |
| `website_analyzer_started` / `website_analyzer_completed` | Analyzer submitted / real result rendered |

## Client lead tracking (foundation)

Leads from contractor websites that Nexus Luma builds use one schema:

`leadId, clientId, name, phone, email, service, serviceArea (ZIP), message,
source, campaign, gclid, landingPage, date, status`

Statuses: `NEW → CONTACTED → ESTIMATE SCHEDULED → WON | LOST` (new leads are `NEW`).

A client site's quote form posts JSON to `/api/contractor-site-lead`:

```js
fetch("https://nexusluma.com/api/contractor-site-lead", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    clientId: "acme-roofing", name, phone, email, service, zip, message,
    source: "google_ads", campaign: utm_campaign, gclid, landingPage: location.href,
    website_confirm: "" // hidden honeypot field, must stay empty
  })
});
```

Leads land in `google-apps-script/client-lead-tracker.gs` (one tab per client
with a status dropdown). That sheet is the **interim** dashboard.

**Not built yet (needs a decision on a database/auth provider):**
- A logged-in client dashboard (per-client auth, lead list, status updates from the UI).
- Persistent storage owned by the app (today the sheet is the system of record).
- Email/SMS new-lead notifications to the contractor.
- Importing Google Ads offline conversions (WON leads → GCLID upload).

## Legacy funnels (kept, not linked from the homepage)

| Route | Status |
|---|---|
| `/questionnaire/` | $99 strategy-session React app (`nexus-luma-questionnaire/`) + `create-payment-intent.js` (9900). Still works; `noindex`. Retire when no ads/emails point to it. |
| `index (1).html` | Older homepage with the $99 Website Improvement Starter Package (`create-upgrade-payment.js`) and the calendar UI. `noindex`. |
| `/checkout`, `/cart`, `/upsell` | Digital-bundle $97 one-click upsell — a separate product funnel; untouched. |
| `pricing_page_design.html`, `mobile-popup-fix.html` | Design drafts; `noindex`. |

## Future niche landing pages

The homepage stays broad-contractor and natural. Planned high-intent pages
(reuse the homepage sections and swap headline, demo query, query list, and
service chips): `/roofing-lead-generation/`, `/hvac-lead-generation/`,
`/plumber-lead-generation/`, `/remodeling-leads/`,
`/google-ads-for-roofers/`, `/google-ads-for-hvac/`,
`/contractor-website-design/`, `/contractor-marketing/`. Link each to
`/start/?trade=…` if you want the trade pre-selected (not implemented yet).

## Manual configuration checklist

1. **Stripe test mode first:** set `STRIPE_SECRET_KEY=sk_test_…` and `STRIPE_PUBLISHABLE_KEY=pk_test_…` in a Netlify deploy preview, run `/start/` with card `4242 4242 4242 4242` (success) and `4000 0000 0000 0002` (decline). The checkout shows a yellow TEST MODE badge.
2. **Webhook:** Stripe → Developers → Webhooks → endpoint `https://<site>/api/stripe-webhook`, event `payment_intent.succeeded` → set `STRIPE_WEBHOOK_SECRET`.
3. **Pipeline sheet:** paste `google-apps-script/lead-system-pipeline.gs` into the lead sheet's Apps Script, run `setupLeadTracker` (color-coded year tab + Dashboard), deploy as a Web app, set `LEAD_SYSTEM_WEBHOOK_URL`.
4. **Client lead sheet:** deploy `google-apps-script/client-lead-tracker.gs`, set `CLIENT_LEADS_WEBHOOK_URL`, `CLIENT_LEADS_WEBHOOK_SECRET`, `CLIENT_LEAD_ALLOWED_CLIENTS`, `CLIENT_LEAD_ALLOWED_ORIGINS`.
5. **Analytics:** add GTM/GA4 and mark `deposit_paid` and `qualification_completed` as conversions.
6. **Live:** switch to `sk_live_…`/`pk_live_…` only after test payments pass.
