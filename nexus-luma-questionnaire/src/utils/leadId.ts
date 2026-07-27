import type { ContactInformation, RecommendedService } from "../types/questionnaire";

export function buildQuestionnaireLeadId(
  recommendedService: Exclude<RecommendedService, "email-follow-up">,
  contact: Pick<ContactInformation, "firstName" | "email"> | null
) {
  const source = `${recommendedService}:${contact?.email || contact?.firstName || "unknown"}`;
  return `nq-${source.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}
