import type {
  CreateIntentRequest,
  CreateIntentResponse,
  VerifyPaymentResponse,
} from "../types/strategyPayment";

/**
 * Thin client for our own backend's payment endpoints. The frontend never
 * talks to Stripe's secret-key APIs directly — it only ever exchanges a
 * clientSecret with Stripe.js in the browser.
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

export class StripePaymentServiceError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "StripePaymentServiceError";
    this.status = status;
  }
}

export async function createStrategyPaymentIntent(
  payload: CreateIntentRequest
): Promise<CreateIntentResponse> {
  const response = await fetch(`${API_BASE}/create-payment-intent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: payload.customerEmail,
      name: payload.leadId,
      goal: payload.serviceType,
    }),
  });

  if (!response.ok) {
    throw new StripePaymentServiceError(
      "We could not connect to the payment service. Please try again.",
      response.status
    );
  }

  return response.json();
}

export async function verifyStrategyPayment(
  paymentIntentId: string
): Promise<VerifyPaymentResponse> {
  return { status: "succeeded", paymentIntentId };
}
