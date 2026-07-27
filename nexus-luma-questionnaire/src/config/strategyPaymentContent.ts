import type { StrategyModalContent, StrategyServiceType } from "../types/strategyPayment";

// The strategy-session amount, in cents. $99.00
export const STRATEGY_SESSION_PRICE = 9900;

export const strategySessionConfig = {
  currency: "usd" as const,
  amount: STRATEGY_SESSION_PRICE,
};

const salesFunnelContent: StrategyModalContent = {
  serviceType: "sales-funnel",
  eyebrow: "Your Recommended Next Step",
  headline: "Start With Your Sales Funnel Strategy Session",
  description:
    "Let's map out how your business can turn more visitors into leads, customers, and sales.",
  benefitsIntro: "During your session, we'll:",
  benefits: [
    "Review your current offer and customer journey",
    "Identify where potential customers may be dropping off",
    "Find opportunities to improve lead generation",
    "Map out the right sales funnel for your business",
    "Create a clear next-step action plan",
    "Answer your questions",
  ],
  price: STRATEGY_SESSION_PRICE,
  priceLabel: "Sales Funnel Strategy Session",
  creditHeading: "Your $99 Goes Toward Your Project",
  creditMessage:
    "If you decide to hire Nexus Luma for your sales funnel, the full $99 strategy-session payment will be credited toward the project total.",
  riskReductionMessage:
    "You are not paying just to hear a sales pitch. You are paying for a focused strategy session built around your business, goals, and current challenges.",
  valueComparisonHeading: "More Than Just a Consultation",
  valueComparisonText:
    "You'll leave the session with a clearer understanding of what your business needs, what to prioritize, and what the next step should be.",
  paymentButtonLabel: "Pay $99 & Start My Funnel Strategy",
  loadingLabel: "Starting Your Funnel Strategy...",
  successHeadline: "Your Sales Funnel Strategy Session Is Ready to Schedule",
  successText:
    "Your payment was successful. Choose a Zoom time that works for you so we can begin planning your sales funnel.",
  successButtonLabel: "Schedule My Zoom Strategy Call",
  whatHappensNext:
    "After payment, you'll be taken to the scheduling page to choose a Zoom time for your Sales Funnel Strategy Session.",
  bookingUrlKey: "salesFunnelBookingUrl",
};

const websiteDesignContent: StrategyModalContent = {
  serviceType: "website-design",
  eyebrow: "Your Recommended Next Step",
  headline: "Start With Your Website Design Strategy Session",
  description:
    "Let's create a clear plan for a website that builds trust, supports your goals, and gives your business a stronger online presence.",
  benefitsIntro: "During your session, we'll:",
  benefits: [
    "Review your current website or business idea",
    "Identify the pages and features your website needs",
    "Discuss your brand, audience, and main goals",
    "Find ways your website can build more trust",
    "Create a clear website project plan",
    "Answer your questions",
  ],
  price: STRATEGY_SESSION_PRICE,
  priceLabel: "Website Design Strategy Session",
  creditHeading: "Your $99 Goes Toward Your Project",
  creditMessage:
    "If you decide to hire Nexus Luma for your website, the full $99 strategy-session payment will be credited toward the project total.",
  riskReductionMessage:
    "You are not paying just to receive a general quote. You are paying for a focused planning session that helps define the right website for your business.",
  valueComparisonHeading: "More Than Just a Consultation",
  valueComparisonText:
    "You'll leave the session with a clearer understanding of what your business needs, what to prioritize, and what the next step should be.",
  paymentButtonLabel: "Pay $99 & Start My Website Plan",
  loadingLabel: "Starting Your Website Plan...",
  successHeadline: "Your Website Strategy Session Is Ready to Schedule",
  successText:
    "Your payment was successful. Choose a Zoom time that works for you so we can begin planning your website.",
  successButtonLabel: "Schedule My Zoom Strategy Call",
  whatHappensNext:
    "After payment, you'll be taken to the scheduling page to choose a Zoom time for your Website Design Strategy Session.",
  bookingUrlKey: "websiteDesignBookingUrl",
};

export const strategyContentMap: Record<StrategyServiceType, StrategyModalContent> = {
  "sales-funnel": salesFunnelContent,
  "website-design": websiteDesignContent,
};

export function getStrategyContent(serviceType: StrategyServiceType): StrategyModalContent {
  return strategyContentMap[serviceType];
}

export const GENERAL_LOADING_LABEL = "Processing Secure Payment...";
