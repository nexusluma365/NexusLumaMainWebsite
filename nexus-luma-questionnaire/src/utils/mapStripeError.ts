/**
 * Converts a Stripe error (or any thrown error) into a short, friendly,
 * non-technical message safe to show to a customer. Never surfaces stack
 * traces, raw Stripe error objects, or API internals.
 */
export function mapStripeError(error: unknown): string {
  const code = extractStripeCode(error);

  switch (code) {
    case "card_declined":
      return "Your card was declined. Try another payment method.";
    case "expired_card":
      return "Your card has expired. Try another payment method.";
    case "incorrect_cvc":
      return "Your card's security code (CVC) is incorrect. Please check it and try again.";
    case "insufficient_funds":
      return "Your card was declined for insufficient funds. Try another payment method.";
    case "processing_error":
      return "Your payment could not be completed. Check your information and try again.";
    case "incorrect_number":
    case "invalid_number":
      return "Your card number looks incorrect. Please check it and try again.";
    case "rate_limit":
    case "api_connection_error":
      return "We could not connect to the payment service. Please try again.";
    default:
      break;
  }

  const type = extractStripeType(error);
  if (type === "validation_error") {
    return "Please check your payment details and try again.";
  }

  // Generic, safe fallback — never leak the raw error.
  return "Your payment could not be completed. Check your information and try again.";
}

/**
 * Message shown when a payment lands in a "processing" state rather than
 * a definitive success or failure (common with some bank-debit methods).
 */
export const PENDING_PAYMENT_MESSAGE =
  "We're waiting for Stripe to confirm your payment. Please do not submit another payment.";

/**
 * Message shown when the client loses connectivity mid-confirmation and
 * cannot tell whether the charge went through.
 */
export const UNKNOWN_STATE_MESSAGE =
  "Your payment may still be processing. Do not submit another payment yet.";

function extractStripeCode(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

function extractStripeType(error: unknown): string | undefined {
  if (error && typeof error === "object" && "type" in error) {
    const type = (error as { type?: unknown }).type;
    return typeof type === "string" ? type : undefined;
  }
  return undefined;
}
