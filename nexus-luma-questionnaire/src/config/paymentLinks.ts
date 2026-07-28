// Centralized, easily-changed links. Override via props on <StrategyPaymentModal />
// or by editing the defaults below if you want a single source of truth.

const ZOOM_STRATEGY_CALL_URL = "https://scheduler.zoom.us/elijah-thornton/30-min-strategy-call";

export const DEFAULT_PAYMENT_LINKS = {
  salesFunnelBookingUrl:
    import.meta.env.VITE_SALES_FUNNEL_BOOKING_URL || ZOOM_STRATEGY_CALL_URL,
  websiteDesignBookingUrl:
    import.meta.env.VITE_WEBSITE_BOOKING_URL || ZOOM_STRATEGY_CALL_URL,
  paymentPolicyUrl: import.meta.env.VITE_PAYMENT_POLICY_URL || "/#privacy",
};

// Whether to automatically redirect to the booking page after a successful
// payment, or show a success screen with a manual "Book now" button.
export const AUTO_REDIRECT_AFTER_PAYMENT = true;

// Whether to show the optional "More Than Just a Consultation" value section.
export const SHOW_VALUE_COMPARISON = true;
