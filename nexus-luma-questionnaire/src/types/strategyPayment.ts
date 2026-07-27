// ============================================================================
// Nexus Luma — Strategy Payment Modal — Shared Types
// ============================================================================

export type StrategyServiceType = "sales-funnel" | "website-design";

export type StrategyServiceTypeApi =
  | "sales-funnel-strategy"
  | "website-design-strategy";

export type PaymentStatus =
  | "idle"
  | "form-loading"
  | "ready"
  | "processing"
  | "pending"
  | "succeeded"
  | "failed";

export interface StrategyModalContent {
  serviceType: StrategyServiceType;
  eyebrow: string;
  headline: string;
  description: string;
  benefitsIntro: string;
  benefits: string[];
  price: number; // cents
  priceLabel: string;
  creditHeading: string;
  creditMessage: string;
  riskReductionMessage: string;
  valueComparisonHeading: string;
  valueComparisonText: string;
  paymentButtonLabel: string;
  loadingLabel: string;
  successHeadline: string;
  successText: string;
  successButtonLabel: string;
  whatHappensNext: string;
  bookingUrlKey: "salesFunnelBookingUrl" | "websiteDesignBookingUrl";
}

export interface StrategyCustomer {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  businessName?: string;
}

export interface StrategyPaymentResult {
  paymentIntentId: string;
  serviceType: StrategyServiceType;
  status: "succeeded" | "processing";
  bookingUrl: string;
  amount: number;
  currency: "usd";
}

export interface StrategyPaymentModalProps {
  isOpen: boolean;
  serviceType: StrategyServiceType;
  leadId?: string;
  customer?: StrategyCustomer;
  questionnaireAnswers?: Record<string, string>;
  salesFunnelBookingUrl: string;
  websiteDesignBookingUrl: string;
  paymentPolicyUrl?: string;
  showValueComparison?: boolean;
  autoRedirectAfterPayment?: boolean;
  /**
   * Stripe publishable key. Optional — if omitted, the component will try
   * to read it from common bundler env conventions (VITE_*, NEXT_PUBLIC_*,
   * REACT_APP_*). Passing it explicitly is the most reliable option and
   * works regardless of which bundler your app uses.
   */
  stripePublishableKey?: string;
  onClose: () => void;
  onPaymentSuccess?: (result: StrategyPaymentResult) => void;
  onAnalyticsEvent?: (
    eventName: StrategyAnalyticsEvent,
    eventData?: Record<string, unknown>
  ) => void;
}

export type StrategyAnalyticsEvent =
  | "strategy_payment_modal_opened"
  | "strategy_payment_form_viewed"
  | "strategy_payment_started"
  | "strategy_payment_failed"
  | "strategy_payment_abandoned"
  | "strategy_payment_completed"
  | "strategy_booking_clicked";

export interface StrategyPaymentRecord {
  leadId: string;
  serviceType: StrategyServiceTypeApi;
  amount: number;
  currency: "usd";
  paymentIntentId: string;
  paymentStatus: "succeeded" | "processing" | "failed";
  customerEmail: string;
  completedAt: string;
  questionnaireAnswers?: Record<string, string>;
}

export interface CreateIntentRequest {
  leadId: string;
  serviceType: StrategyServiceTypeApi;
  customerEmail: string;
}

export interface CreateIntentResponse {
  clientSecret: string;
  paymentIntentId: string;
}

export interface VerifyPaymentRequest {
  paymentIntentId: string;
}

export interface VerifyPaymentResponse {
  status: "succeeded" | "processing" | "failed";
  paymentIntentId: string;
}
