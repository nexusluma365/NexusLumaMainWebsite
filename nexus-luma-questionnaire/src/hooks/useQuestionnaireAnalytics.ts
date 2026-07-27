import { useMemo } from "react";
import { createTracker, type AnalyticsHandler } from "../services/analyticsService";

export function useQuestionnaireAnalytics(externalHandler?: AnalyticsHandler): AnalyticsHandler {
  return useMemo(() => createTracker(externalHandler), [externalHandler]);
}
