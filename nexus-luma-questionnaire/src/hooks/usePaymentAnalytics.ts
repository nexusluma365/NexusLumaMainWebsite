import { useCallback, useRef } from "react";
import { trackPaymentEvent } from "../services/analyticsService";
import type { StrategyAnalyticsEvent, StrategyServiceType } from "../types/strategyPayment";

interface UsePaymentAnalyticsParams {
  serviceType: StrategyServiceType;
  leadId?: string;
  questionnairePath?: string;
  onAnalyticsEvent?: (
    eventName: StrategyAnalyticsEvent,
    eventData?: Record<string, unknown>
  ) => void;
}

export function usePaymentAnalytics({
  serviceType,
  leadId,
  questionnairePath,
  onAnalyticsEvent,
}: UsePaymentAnalyticsParams) {
  // Tracks whether a completed/abandoned event has already fired so we
  // don't double-report on unmount races.
  const terminalEventFired = useRef(false);

  const track = useCallback(
    (eventName: StrategyAnalyticsEvent, extra?: Record<string, unknown>) => {
      if (
        (eventName === "strategy_payment_completed" ||
          eventName === "strategy_payment_abandoned") &&
        terminalEventFired.current
      ) {
        return;
      }
      if (
        eventName === "strategy_payment_completed" ||
        eventName === "strategy_payment_abandoned"
      ) {
        terminalEventFired.current = true;
      }

      trackPaymentEvent(
        eventName,
        {
          serviceType,
          leadId,
          strategySessionType: serviceType,
          questionnairePath,
        },
        extra,
        onAnalyticsEvent as (name: string, data?: Record<string, unknown>) => void
      );
    },
    [serviceType, leadId, questionnairePath, onAnalyticsEvent]
  );

  const resetTerminalGuard = useCallback(() => {
    terminalEventFired.current = false;
  }, []);

  return { track, resetTerminalGuard };
}
