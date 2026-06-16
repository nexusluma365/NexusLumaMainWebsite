# Nexus Luma Website

Static Nexus Luma landing page with a single-page Website Audit lead generation flow, Claude-powered analysis, and in-modal Stripe payment for the $99 Website Improvement Starter Package.

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
ANTHROPIC_MODEL
```

Required for the in-modal $99 payment:

```text
STRIPE_PUBLISHABLE_KEY
STRIPE_SECRET_KEY
```

Optional lead capture webhook:

```text
LEAD_WEBHOOK_URL
```

Do not commit `.env` or real API keys.

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
- The audit and payment flow stay inside the same modal.
- Stripe is configured for card payments so visitors do not leave the page.

