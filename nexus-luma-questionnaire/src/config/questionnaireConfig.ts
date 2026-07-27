import type { QuestionnaireQuestion } from "../types/questionnaire";

// ---------------------------------------------------------------------------
// Question configuration
//
// Adding a new service path later (SEO, Branding, AI Automation, etc.) means:
//   1. Add new question objects with a new `path` value below.
//   2. Add a routing rule in questionnaireRoutes.ts for the branch entry point.
//   3. Add a recommendation entry in leadQualification.ts.
// No UI component needs to change.
// ---------------------------------------------------------------------------

export const PRIMARY_QUESTION_ID = "primary-goal";

export const questionnaireQuestions: QuestionnaireQuestion[] = [
  // ---- Shared entry question -------------------------------------------------
  {
    id: PRIMARY_QUESTION_ID,
    path: "shared",
    headline: "What's Your Biggest Goal Right Now?",
    answerKey: "primaryGoal",
    options: [
      { id: "more-customers", label: "Get More Customers", value: "get-more-customers" },
      { id: "sell-more", label: "Sell More Products", value: "sell-more-products" },
      { id: "build-brand", label: "Build My Brand", value: "build-my-brand" },
      { id: "just-website", label: "Just Need a Website", value: "just-need-a-website" },
    ],
  },

  // ---- Sales Funnel path ------------------------------------------------------
  {
    id: "sf-traffic-source",
    path: "sales-funnel",
    headline: "How Are Customers Finding You Today?",
    answerKey: "currentTrafficSource",
    options: [
      { id: "google", label: "Google", value: "google" },
      { id: "social", label: "Facebook or Instagram", value: "facebook-instagram" },
      { id: "word-of-mouth", label: "Word of Mouth", value: "word-of-mouth" },
      { id: "just-starting", label: "Just Getting Started", value: "just-getting-started" },
    ],
  },
  {
    id: "sf-lead-collection",
    path: "sales-funnel",
    headline: "Do You Currently Have a Way to Collect Leads Online?",
    answerKey: "hasLeadCollectionSystem",
    options: [
      { id: "yes", label: "Yes", value: "yes" },
      { id: "no", label: "No", value: "no" },
      { id: "not-sure", label: "Not Sure", value: "not-sure" },
    ],
  },
  {
    id: "sf-growth-problem",
    path: "sales-funnel",
    headline: "What's Stopping You From Getting More Customers?",
    answerKey: "mainGrowthProblem",
    options: [
      { id: "not-enough-leads", label: "Not Enough Leads", value: "not-enough-leads" },
      { id: "visitors-leave", label: "Visitors Leave My Website", value: "visitors-leave-my-website" },
      { id: "no-sales-system", label: "I Don't Have a Sales System", value: "no-sales-system" },
      { id: "not-sure", label: "I'm Not Sure", value: "not-sure" },
    ],
  },
  {
    id: "sf-purchase-intent",
    path: "sales-funnel",
    headline: "If We Showed You a Clear Plan to Improve Your Results, What Would You Most Likely Do?",
    answerKey: "purchaseIntent",
    options: [
      { id: "get-started", label: "Get Started", value: "get-started" },
      { id: "think-it-over", label: "Think It Over", value: "think-it-over" },
      { id: "gathering-info", label: "Just Gathering Information", value: "just-gathering-information" },
    ],
  },

  // ---- Website path ------------------------------------------------------------
  {
    id: "web-reason",
    path: "website",
    headline: "Why Do You Need a Website?",
    answerKey: "websiteReason",
    options: [
      { id: "no-website", label: "My Business Doesn't Have One", value: "no-website" },
      { id: "outdated", label: "Mine Looks Outdated", value: "outdated" },
      { id: "credibility", label: "I Want More Credibility", value: "more-credibility" },
      { id: "new-business", label: "I'm Starting Something New", value: "starting-something-new" },
    ],
  },
  {
    id: "web-goal",
    path: "website",
    headline: "What Should Your Website Help You Do?",
    answerKey: "websiteGoal",
    options: [
      { id: "generate-leads", label: "Generate Leads", value: "generate-leads" },
      { id: "show-services", label: "Show My Services", value: "show-my-services" },
      { id: "build-trust", label: "Build Trust", value: "build-trust" },
      { id: "share-info", label: "Share Information", value: "share-information" },
    ],
  },
  {
    id: "web-domain",
    path: "website",
    headline: "Do You Already Own a Domain?",
    answerKey: "ownsDomain",
    options: [
      { id: "yes", label: "Yes", value: "yes" },
      { id: "no", label: "No", value: "no" },
      { id: "not-sure", label: "Not Sure", value: "not-sure" },
    ],
  },
  {
    id: "web-purchase-intent",
    path: "website",
    headline: "If We Showed You a Clear Plan to Improve Your Online Presence, What Would You Most Likely Do?",
    answerKey: "purchaseIntent",
    options: [
      { id: "get-started", label: "Get Started", value: "get-started" },
      { id: "think-it-over", label: "Think It Over", value: "think-it-over" },
      { id: "gathering-info", label: "Just Gathering Information", value: "just-gathering-information" },
    ],
  },
];

export const questionsById: Record<string, QuestionnaireQuestion> = Object.fromEntries(
  questionnaireQuestions.map((q) => [q.id, q])
);

export const SALES_FUNNEL_QUESTION_IDS = [
  "sf-traffic-source",
  "sf-lead-collection",
  "sf-growth-problem",
  "sf-purchase-intent",
];

export const WEBSITE_QUESTION_IDS = ["web-reason", "web-goal", "web-domain", "web-purchase-intent"];
