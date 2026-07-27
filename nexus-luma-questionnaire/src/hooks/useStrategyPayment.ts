import { useCallback, useRef, useState } from "react";
import { CardElement, useElements, useStripe } from "@stripe/react-stripe-js";
import {
  createStrategyPaymentIntent,
  verifyStrategyPayment,
} from "../services/stripePaymentService";
import { submitPaymentToCrm } from "../services/crmPaymentService";
import { mapStripeError, PENDING_PAYMENT_MESSAGE } from "../utils/mapStripeError";
import { toApiServiceType } from "../utils/paymentMetadata";
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
  serviceType,
  leadId,
  customer,
  questionnaireAnswers,
  bookingUrl,
  amount,
  onSuccess,
  onEvent,
}: UseStrategyPaymentParams) {
  const stripe = useStripe();
  const elements = useElements();

  // The card field renders instantly. The actual PaymentIntent is created
  // lazily, right before confirmation, using the questionnaire email.
  const [status, setStatus] = useState<PaymentStatus>("ready");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);

  // Guards against creating duplicate PaymentIntents on repeated submits,
  // and against duplicate submissions from repeated button clicks.
  const intentRequestInFlight = useRef<Promise<{
    clientSecret: string;
    paymentIntentId: string;
  }> | null>(null);
  const submissionInFlight = useRef(false);

  const ensurePaymentIntent = useCallback(
    async (customerEmail: string) => {
      if (clientSecret && paymentIntentId) {
        return { clientSecret, paymentIntentId };
      }
      if (intentRequestInFlight.current) {
        return intentRequestInFlight.current;
      }

      const request = (async () => {
        const result = await createStrategyPaymentIntent({
          leadId,
          serviceType: toApiServiceType(serviceType),
          customerEmail,
        });
        setClientSecret(result.clientSecret);
        setPaymentIntentId(result.paymentIntentId);
        return result;
      })();

      intentRequestInFlight.current = request;
      try {
        return await request;
      } finally {
        intentRequestInFlight.current = null;
      }
    },
    [clientSecret, paymentIntentId, leadId, serviceType]
  );

  const handleConfirmedSuccess = useCallback(
    async (confirmedPaymentIntentId: string, customerEmail: string) => {
      setStatus("succeeded");
      onEvent?.("succeeded");

      // Server-side verification — never rely solely on the frontend result.
      try {
        await verifyStrategyPayment(confirmedPaymentIntentId);
      } catch {
        // Non-fatal for the UX: Stripe already confirmed success client-side,
        // and the webhook is the authoritative source server-side. We still
        // show success, since telling the customer their charge failed when
        // Stripe says it succeeded would be actively misleading.
      }

      // CRM submission — isolated from payment status entirely.
      submitPaymentToCrm({
        leadId,
        serviceType: toApiServiceType(serviceType),
        amount,
        currency: "usd",
        paymentIntentId: confirmedPaymentIntentId,
        paymentStatus: "succeeded",
        customerEmail,
        completedAt: new Date().toISOString(),
        questionnaireAnswers,
      });

      onSuccess?.({
        paymentIntentId: confirmedPaymentIntentId,
        serviceType,
        status: "succeeded",
        bookingUrl,
        amount,
        currency: "usd",
      });
    },
    [amount, bookingUrl, leadId, onEvent, onSuccess, questionnaireAnswers, serviceType]
  );

  const submitPayment = useCallback(
    async (billingDetails: { name: string; email: string; phone?: string }) => {
      if (!stripe || !elements) return;
      if (submissionInFlight.current) return; // prevent duplicate clicks
      submissionInFlight.current = true;

      setStatus("processing");
      setErrorMessage(null);
      onEvent?.("started");

      try {
        const cardElement = elements.getElement(CardElement);
        if (!cardElement) {
          setErrorMessage("The card form could not load. Please refresh and try again.");
          setStatus("failed");
          onEvent?.("failed", "card_element_missing");
          return;
        }

        let intent: { clientSecret: string; paymentIntentId: string };
        try {
          intent = await ensurePaymentIntent(billingDetails.email);
        } catch {
          setErrorMessage(
            "We could not connect to the payment service. Please try again."
          );
          setStatus("failed");
          onEvent?.("failed", "intent_creation_failed");
          return;
        }

        const { error, paymentIntent } = await stripe.confirmCardPayment(
          intent.clientSecret,
          {
            payment_method: {
              card: cardElement,
              billing_details: {
                name: billingDetails.name,
                email: billingDetails.email,
                phone: billingDetails.phone || undefined,
                address: { country: "US" },
              },
            },
            receipt_email: billingDetails.email,
          }
        );

        if (error) {
          setErrorMessage(mapStripeError(error));
          setStatus("failed");
          onEvent?.("failed", error);
          return;
        }

        if (!paymentIntent) {
          setErrorMessage(
            "Your payment may still be processing. Do not submit another payment yet."
          );
          setStatus("pending");
          return;
        }

        if (paymentIntent.status === "succeeded") {
          await handleConfirmedSuccess(paymentIntent.id, billingDetails.email);
          return;
        }

        if (paymentIntent.status === "processing") {
          setStatus("pending");
          setErrorMessage(PENDING_PAYMENT_MESSAGE);
          onEvent?.("pending");
          return;
        }

        // requires_payment_method, requires_action, canceled, etc.
        setErrorMessage(
          "Your payment could not be completed. Check your information and try again."
        );
        setStatus("failed");
        onEvent?.("failed", paymentIntent.status);
      } catch (err) {
        setErrorMessage(mapStripeError(err));
        setStatus("failed");
        onEvent?.("failed", err);
      } finally {
        submissionInFlight.current = false;
      }
    },
    [stripe, elements, ensurePaymentIntent, handleConfirmedSuccess] // eslint-disable-line react-hooks/exhaustive-deps
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
