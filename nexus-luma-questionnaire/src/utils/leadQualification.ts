import type { LeadIntent, RecommendedService, ServicePath } from "../types/questionnaire";

/**
 * Classifies purchase intent based on the final "what would you do" answer.
 */
export function classifyIntent(purchaseIntent: string): LeadIntent {
  switch (purchaseIntent) {
    case "get-started":
      return "high";
    case "think-it-over":
      return "medium";
    case "just-gathering-information":
    default:
      return "low";
  }
}

export function isQualifiedIntent(intent: LeadIntent): boolean {
  return intent === "high" || intent === "medium";
}

/**
 * Combines the active path + intent into the final recommended service.
 * Low-intent leads always route to the email follow-up regardless of path.
 */
export function getRecommendedService(path: ServicePath, intent: LeadIntent): RecommendedService {
  if (!isQualifiedIntent(intent)) {
    return "email-follow-up";
  }
  return path === "sales-funnel" ? "sales-funnel-strategy" : "website-strategy";
}
