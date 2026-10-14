# Nexus Luma Website

Nexus Luma builds **lead generation systems for contractors**: website + Google Search Ads setup + conversion/lead tracking + 30 days of campaign management.

- `/` — contractor sales page (static HTML + GSAP)
- `/start/` — qualification → **$275 deposit** on the **$799** Contractor Lead System (Stripe, amount fixed server-side)
- `/book/` — strategy call booking
- Website analyzer (Claude-powered) as a secondary lead magnet on the homepage

Full architecture, tracking events, client lead tracking, legacy routes, and the
setup checklist: **[docs/LEAD-SYSTEM.md](docs/LEAD-SYSTEM.md)**.

## Local Development

Use Netlify Dev so the serverless functions are available:

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:8888/
```

## Required Environment Variables

Create a local `.env` file from `.env.example`, then add the real keys:

```bash
cp .env.example .env
```

Required for the AI audit:

```text
ANTHROPIC_API_KEY
ANTHROPIC_MODEL=claude-haiku-4-5
```

Required for the $275 Contractor Lead System deposit (use test keys until verified):

```text
STRIPE_SECRET_KEY
STRIPE_PUBLISHABLE_KEY   (same mode as the secret key)
STRIPE_WEBHOOK_SECRET
```

Lead pipeline + client lead tracking (see docs/LEAD-SYSTEM.md):

```text
LEAD_SYSTEM_WEBHOOK_URL
CLIENT_LEADS_WEBHOOK_URL, CLIENT_LEADS_WEBHOOK_SECRET
CLIENT_LEAD_ALLOWED_CLIENTS, CLIENT_LEAD_ALLOWED_ORIGINS
```

Optional lead capture webhook:

```text
LEAD_WEBHOOK_URL
```

Do not commit `.env` or real API keys.

## Google Sheets Lead Capture

The Website Analyzer can send every completed audit lead to Google Sheets through a Google Apps Script Web App.

1. Open your Google Sheet.
2. Go to `Extensions` > `Apps Script`.
3. Paste the script from `google-apps-script/website-analyzer-leads.gs`.
4. Run `setupLeadSheet` once to create and format the columns.
5. Deploy as a Web App:
   - Execute as: `Me`
   - Who has access: `Anyone`
6. Copy the Web App URL.
7. Add that URL to Netlify as:

```text
LEAD_WEBHOOK_URL
```

The sheet records the lead details, submitted website, analyzed website, score, category breakdown, recommendations, audit sections, and raw JSON backup.

## Netlify Deployment

1. Push this folder to GitHub.
2. Create a new Netlify site from the GitHub repo.
3. Use these build settings:
   - Build command: leave blank
   - Publish directory: `.`
   - Functions directory: `netlify/functions`
4. Add the environment variables in Netlify:
   - `ANTHROPIC_API_KEY`
   - `ANTHROPIC_MODEL`
   - `STRIPE_PUBLISHABLE_KEY`
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `LEAD_SYSTEM_WEBHOOK_URL`
   - `LEAD_WEBHOOK_URL` if used

## Checks

Run:

```bash
npm run check   # syntax of page scripts + all Netlify functions
npm test        # Lead System payment/lead logic (Stripe + webhooks mocked; no network)
```

## Notes

- Claude and Stripe keys are only used by Netlify functions.
- The audit runs server-side through Claude, using the live page fetch as source evidence.
- The deposit amount (27500 cents) is set only in `netlify/functions/_lead-system.js`; `deposit_paid` is tracked only after server-side verification.
- `/questionnaire/` and `index (1).html` are legacy $99 funnels kept for existing links (`noindex`, not linked from the homepage).
