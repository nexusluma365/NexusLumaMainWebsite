# Nexus Luma Website

Static Nexus Luma landing page with a single-page Website Audit lead generation flow, Claude-powered analysis, and Stripe Checkout for the $99 Website Improvement Starter Package.

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

Required for the $99 Stripe Checkout payment:

```text
STRIPE_SECRET_KEY
```

Optional if you need the Stripe config endpoint elsewhere:

```text
STRIPE_PUBLISHABLE_KEY
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
   - `LEAD_WEBHOOK_URL` if used

## Checks

Run:

```bash
npm run check
```

This checks inline page JavaScript and Netlify function syntax.

## Notes

- Claude and Stripe keys are only used by Netlify functions.
- The audit runs server-side through Claude, using the live page fetch as source evidence.
- Stripe Checkout opens in the same tab and returns visitors to the site after payment.
