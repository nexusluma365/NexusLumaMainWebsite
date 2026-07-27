import type { StrategyPaymentRecord } from "../types/strategyPayment";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

/**
 * Sends the completed payment record to the CRM via our backend.
 *
 * IMPORTANT: A failure here must never be surfaced to the user as a
 * payment failure — the Stripe charge already succeeded. We log the
 * issue and let backend automation / a background job retry it.
 */
export async function submitPaymentToCrm(
  record: StrategyPaymentRecord
): Promise<{ ok: boolean }> {
  try {
    const response = await fetch(`${API_BASE}/submit-lead`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    });

    if (!response.ok) {
      console.error("[crmPaymentService] CRM submission failed", response.status);
      return { ok: false };
    }

    return { ok: true };
  } catch (error) {
    // Swallow — this must never block or falsely alter the payment UX.
    console.error("[crmPaymentService] CRM submission error", error);
    return { ok: false };
  }
}
