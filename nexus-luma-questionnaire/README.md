# Nexus Luma Questionnaire

A premium, app-style business questionnaire that routes visitors toward one of
three outcomes:

1. A **$99 Sales Funnel Strategy Call**
2. A **$99 Website Strategy Call**
3. A respectful **low-intent email follow-up**

Built with React + TypeScript + Vite + Framer Motion. Designed to be dropped
into the existing Nexus Luma website as a self-contained component.

---

## 1. Run it locally

```bash
npm install
npm run dev
```

Open the URL Vite prints (typically `http://localhost:5173`).

```bash
npm run build      # production build → dist/
npm run preview    # preview the production build locally
```

---

## 2. Project structure

```text
src/
  components/questionnaire/   All UI screens + the orchestrator (QuestionnaireApp)
  config/                     Question data, routing rules, external link config
  hooks/                      useQuestionnaire (state/reducer), analytics, UTM capture
  services/                   Analytics tracker + mock CRM lead submission
  types/questionnaire.ts      All shared TypeScript types
  utils/                      Lead scoring, progress math, branch cleanup, validation
  styles/questionnaire.css    Design system (glassmorphic, matches provided reference)
  index.ts                    Public export — import from here when integrating
  App.tsx / main.tsx          Local demo host only, not needed once integrated
```

---

## 3. Integrating into the Nexus Luma site

### Option A — Import as a component

Copy the `src/` contents (everything except `App.tsx` and `main.tsx`, which
are demo-only) into your existing project, then:

```tsx
import { QuestionnaireApp } from "./path/to/questionnaire";

function FindMySolutionPage() {
  return (
    <QuestionnaireApp
      salesFunnelBookingUrl="https://nexusluma.com/book/sales-funnel-strategy"
      websiteBookingUrl="https://nexusluma.com/book/website-strategy"
      homeUrl="https://nexusluma.com"
      onComplete={(result) => {
        // result.recommendedService, result.leadIntent, result.answers,
        // result.contactInformation, result.campaignParameters, etc.
      }}
      onAnalyticsEvent={(eventName, data) => {
        // forward to GA / Meta Pixel / your CRM
      }}
    />
  );
}
```

### Option B — Dedicated route

Mount `<QuestionnaireApp />` on its own route (e.g. `/find-my-solution`) using
whatever router the main site uses (React Router, Next.js, etc.). The
component is fully self-contained and fills its parent container.

### Option C — Open from a CTA button (modal/drawer)

```tsx
{isOpen && (
  <div className="modal-overlay">
    <QuestionnaireApp onComplete={handleComplete} />
  </div>
)}
```

### Booking URLs

Never hardcode a booking provider deeper than `src/config/appLinks.ts`. Two
ways to configure the URLs:

- **Environment variables** (see `.env.example`): `VITE_SALES_FUNNEL_BOOKING_URL`,
  `VITE_WEBSITE_BOOKING_URL`, `VITE_NEXUS_LUMA_HOME_URL`.
- **Props**, which always win over env vars: `salesFunnelBookingUrl`,
  `websiteBookingUrl`, `homeUrl` on `<QuestionnaireApp />`.

### Connecting the CRM

`src/services/questionnaireLeadService.ts` exports `submitQuestionnaireLead`.
By default it's a mock: it logs the payload in dev and resolves after a short
delay. To connect a real endpoint:

1. Set `VITE_LEAD_SUBMISSION_ENDPOINT` to your webhook/CRM URL, **or**
2. Pass your own function via the `submitLead` prop on `<QuestionnaireApp />`
   if you need custom auth headers, a different destination, etc.

Either way, the function receives a complete `QuestionnaireResult`:

```ts
interface QuestionnaireResult {
  recommendedService: "sales-funnel-strategy" | "website-strategy" | "email-follow-up";
  leadIntent: "high" | "medium" | "low";
  path: "sales-funnel" | "website";
  answers: Record<string, string>;
  contactInformation: { firstName, email, phone?, businessName?, websiteUrl? };
  completedAt: string; // ISO timestamp
  campaignParameters?: { utm_source?, utm_medium?, utm_campaign?, utm_content?, utm_term?, ref?, landingPageUrl?, referrer? };
  deviceType?: "mobile" | "tablet" | "desktop";
}
```

### Connecting analytics

Pass `onAnalyticsEvent={(eventName, data) => ...}` to forward every event
(see `src/services/analyticsService.ts` for the full list —
`questionnaire_started`, `answer_selected`, `questionnaire_completed`, etc.)
to Google Analytics, Meta Pixel, or your CRM. In development, events also log
to the browser console automatically.

### Changing questions without touching UI components

Edit `src/config/questionnaireConfig.ts`. Every question is a plain data
object (`headline`, `options`, `answerKey`). No component needs to change to
edit copy, add an option, or reorder a branch's questions.

### Adding a new service branch (SEO, Branding, AI Automation, etc.)

1. Add new `QuestionnaireQuestion` objects to `questionnaireConfig.ts` with a
   new `path` value (e.g. `"seo"`), and add its question-id list export.
2. In `questionnaireRoutes.ts`, add the new path to `PATH_QUESTION_IDS` and
   map the relevant primary-goal answer(s) to it in `PRIMARY_GOAL_TO_PATH`
   (or extend the primary question's options).
3. In `leadQualification.ts`, extend `getRecommendedService` to return the
   new `RecommendedService` value, and add a new result screen component
   (copy `RecommendationScreen.tsx` as a starting point) if it needs unique
   copy/benefits.

No existing screen component needs to be rewritten.

### Making a contact field required

Pass `contactFieldRequirements` to `<QuestionnaireApp />`:

```tsx
<QuestionnaireApp contactFieldRequirements={{ phone: true, businessName: true }} />
```

---

## 4. Behavior notes

- **Auto-advance**: selecting an answer saves it, shows a checkmark, briefly
  holds (≈320ms), fades out (≈240ms), then advances — no "Next" button on
  question screens.
- **Back navigation**: uses real navigation history (not a hardcoded step
  number), so going back always returns to the correct prior screen with the
  previous answer visible and editable.
- **Branch reset**: changing the first question's answer (e.g. from "Get More
  Customers" to "Just Need a Website") clears the now-irrelevant branch's
  answers and history so they can never leak into the final recommendation.
- **Progress**: branch-aware; never shows 100% until the contact/result stage.
- **Persistence**: answers persist to `sessionStorage` (survives refresh, not
  a new tab/session) unless `disablePersistence` is passed.
- **Reduced motion**: `prefers-reduced-motion` shortens/removes animation.
- **Accessibility**: real `<button>` elements for every answer, full keyboard
  support (Tab/Enter/Space), visible focus states, focus moves to each new
  question's heading after a transition, ARIA progressbar, labeled back
  button, inline error messages tied to inputs via `aria-describedby`.
- **Dev panel**: pass `devMode` to see live state (step, branch, answers,
  navigation history) in a fixed on-screen panel. Defaults to off; do not
  enable in production.

---

## 5. Testing the branching logic

The 10 flows in the original spec (3 Sales Funnel outcomes, 3 Website
outcomes, a branch change, an in-branch answer change, a failed submission,
and a keyboard-only pass) can all be run manually against `npm run dev`.
`devMode={true}` on `<QuestionnaireApp />` makes it easy to confirm branch,
stored answers, and navigation history at each step while testing.

---

## 6. Security & privacy

- No payment information is collected in this component.
- User text is lightly sanitized before submission.
- All external endpoints/keys are read from environment variables — nothing
  sensitive is hardcoded in source.
