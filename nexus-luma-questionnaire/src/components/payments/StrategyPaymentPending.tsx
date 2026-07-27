

export function StrategyPaymentPending() {
  return (
    <div className="nl-pending-box" role="status" aria-live="polite">
      <div>
        <strong>Your Payment Is Processing.</strong>
        <p style={{ margin: "4px 0 0" }}>
          We're waiting for Stripe to confirm your payment. Please do not submit another
          payment.
        </p>
      </div>
    </div>
  );
}
