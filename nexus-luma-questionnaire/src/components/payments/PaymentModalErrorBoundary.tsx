import React from "react";

interface State {
  hasError: boolean;
}

/**
 * Wraps the modal content so that if something unexpected throws during
 * render (a misconfigured bundler, a bad prop, a Stripe.js load failure),
 * the customer sees a clear message instead of a blank modal — and you
 * get a console error pointing at the real cause.
 */
export class PaymentModalErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: unknown) {
    console.error("[StrategyPaymentModal] Render error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "24px", color: "#f5f7ff" }}>
          <p style={{ fontWeight: 700, marginBottom: 8 }}>
            Something went wrong loading this payment form.
          </p>
          <p style={{ fontSize: 13, opacity: 0.8 }}>
            Please refresh the page and try again. If this keeps happening,
            check your browser console for the specific error and confirm your
            Stripe publishable key is configured correctly.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
