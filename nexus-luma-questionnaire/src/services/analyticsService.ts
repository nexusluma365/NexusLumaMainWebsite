// ---------------------------------------------------------------------------
// Analytics event layer
//
// Provider-agnostic. Connect to Google Analytics, Meta Pixel, the Nexus Luma
// CRM, or email automation software by supplying `onAnalyticsEvent` to
// <QuestionnaireApp />. In development, events are also logged to console.
// ---------------------------------------------------------------------------

export const ANALYTICS_EVENTS = {
  QUESTIONNAIRE_STARTED: "questionnaire_started",
  QUESTION_VIEWED: "question_viewed",
  ANSWER_SELECTED: "answer_selected",
  BACK_CLICKED: "questionnaire_back_clicked",
  BRANCH_SELECTED: "questionnaire_branch_selected",
  CONTACT_FORM_VIEWED: "lead_form_viewed",
  CONTACT_FORM_SUBMITTED: "lead_form_submitted",
  QUESTIONNAIRE_COMPLETED: "questionnaire_completed",
  LEAD_CLASSIFIED: "lead_classified",
  RECOMMENDATION_VIEWED: "recommendation_viewed",
  LOW_INTENT_RESULT_VIEWED: "low_intent_result_displayed",
  BOOKING_CLICKED: "strategy_call_clicked",
} as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

export type AnalyticsHandler = (eventName: string, eventData?: Record<string, unknown>) => void;

export interface PaymentAnalyticsContext {
  serviceType: string;
  leadId?: string;
  strategySessionType: string;
  questionnairePath?: string;
}

/**
 * Creates a tracking function bound to an optional external handler.
 * Always logs to console in development so the flow can be verified without
 * a connected analytics provider.
 */
export function createTracker(externalHandler?: AnalyticsHandler): AnalyticsHandler {
  return (eventName, eventData) => {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info(`[analytics] ${eventName}`, eventData ?? {});
    }
    externalHandler?.(eventName, eventData);
  };
}

export function trackPaymentEvent(
  eventName: string,
  context: PaymentAnalyticsContext,
  extra?: Record<string, unknown>,
  onAnalyticsEvent?: AnalyticsHandler
): void {
  const payload = { ...context, ...extra };

  if (onAnalyticsEvent) {
    onAnalyticsEvent(eventName, payload);
    return;
  }

  if (typeof window !== "undefined") {
    const dataWindow = window as unknown as { dataLayer?: unknown[] };
    if (Array.isArray(dataWindow.dataLayer)) {
      dataWindow.dataLayer.push({ event: eventName, ...payload });
    }
  }
}
