import { useCallback, useRef, useState } from "react";
import type {
  PaymentStatus,
  StrategyCustomer,
  StrategyPaymentResult,
  StrategyServiceType,
} from "../types/strategyPayment";

interface UseStrategyPaymentParams {
  serviceType: StrategyServiceType;
  leadId: string;
  customer?: StrategyCustomer;
  questionnaireAnswers?: Record<string, string>;
  bookingUrl: string;
  amount: number;
  onSuccess?: (result: StrategyPaymentResult) => void;
  onEvent?: (event: "started" | "failed" | "succeeded" | "pending", detail?: unknown) => void;
}

export function useStrategyPayment({
  customer,
  onEvent,
}: UseStrategyPaymentParams) {
  const [status, setStatus] = useState<PaymentStatus>("ready");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [clientSecret] = useState<string | null>(null);
  const [paymentIntentId] = useState<string | null>(null);

  const submissionInFlight = useRef(false);

  const submitPayment = useCallback(
    async (_billingDetails: { name: string; email: string; phone?: string }) => {
      if (submissionInFlight.current) return; // prevent duplicate clicks
      submissionInFlight.current = true;

      setStatus("processing");
      setErrorMessage(null);
      onEvent?.("started");

      try {
        setErrorMessage("The embedded card form has been removed.");
        setStatus("failed");
        onEvent?.("failed", "card_element_removed");
      } finally {
        submissionInFlight.current = false;
      }
    },
    [onEvent]
  );

  const resetError = useCallback(() => {
    setErrorMessage(null);
    if (status === "failed") setStatus("ready");
  }, [status]);

  return {
    status,
    setStatus,
    errorMessage,
    clientSecret,
    paymentIntentId,
    submitPayment,
    resetError,
    customer,
  };
}
