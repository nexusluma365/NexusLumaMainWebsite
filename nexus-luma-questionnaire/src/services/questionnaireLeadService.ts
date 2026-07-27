import type { QuestionnaireResult } from "../types/questionnaire";
import { LEAD_SUBMISSION_ENDPOINT, LEAD_SUBMISSION_SECRET } from "../config/appLinks";

// ---------------------------------------------------------------------------
// Lead submission service
//
// This is a mock implementation. When Nexus Luma is ready to connect a real
// CRM endpoint, set VITE_LEAD_SUBMISSION_ENDPOINT and swap the body of
// `submitQuestionnaireLead` for a real fetch call (the shape below already
// matches what most CRM/webhook endpoints expect).
// ---------------------------------------------------------------------------

let lastSubmittedAt: string | null = null;

export class LeadSubmissionError extends Error {}

function isGoogleAppsScriptEndpoint(endpoint: string) {
  return endpoint.includes("script.google.com") || endpoint.includes("googleusercontent.com");
}

/**
 * Submits a completed questionnaire result.
 * Guards against duplicate submissions of the exact same completed payload.
 */
export async function submitQuestionnaireLead(result: QuestionnaireResult): Promise<void> {
  if (lastSubmittedAt === result.completedAt) {
    // Already submitted this exact result — no-op to avoid duplicate leads.
    return;
  }

  if (!LEAD_SUBMISSION_ENDPOINT) {
    // No real endpoint configured yet — simulate network latency and log.
    await new Promise((resolve) => setTimeout(resolve, 600));
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info("[lead-service] mock submission payload", result);
    }
    lastSubmittedAt = result.completedAt;
    return;
  }

  try {
    const payload = LEAD_SUBMISSION_SECRET ? { ...result, secret: LEAD_SUBMISSION_SECRET } : result;

    if (isGoogleAppsScriptEndpoint(LEAD_SUBMISSION_ENDPOINT)) {
      await fetch(LEAD_SUBMISSION_ENDPOINT, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      });
      lastSubmittedAt = result.completedAt;
      return;
    }

    const response = await fetch(LEAD_SUBMISSION_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new LeadSubmissionError(`Lead submission failed with status ${response.status}`);
    }

    lastSubmittedAt = result.completedAt;
  } catch (error) {
    if (error instanceof LeadSubmissionError) throw error;
    throw new LeadSubmissionError("Lead submission failed due to a network error.");
  }
}
