// Centralized, easily-changed links. Override via props on <StrategyPaymentModal />
// or by editing the defaults below if you want a single source of truth.

export const DEFAULT_PAYMENT_LINKS = {
  salesFunnelBookingUrl:
    import.meta.env.VITE_SALES_FUNNEL_BOOKING_URL || "https://calendar.app.google/nrmfrLcW2mooUNUz6",
  websiteDesignBookingUrl:
    import.meta.env.VITE_WEBSITE_BOOKING_URL || "https://calendar.app.google/nrmfrLcW2mooUNUz6",
  paymentPolicyUrl: import.meta.env.VITE_PAYMENT_POLICY_URL || "/#privacy",
};

// Whether to automatically redirect to the booking page after a successful
// payment, or show a success screen with a manual "Book now" button.
// Default is false so users can clearly see payment confirmation first.
export const AUTO_REDIRECT_AFTER_PAYMENT = false;

// Whether to show the optional "More Than Just a Consultation" value section.
export const SHOW_VALUE_COMPARISON = true;
