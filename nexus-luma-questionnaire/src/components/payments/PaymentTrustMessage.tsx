

export function PaymentTrustMessage() {
  return (
    <p className="nl-trust-row">
      <LockIcon />
      Secure payment powered by Stripe. Your card information is never stored by Nexus Luma.
    </p>
  );
}

function LockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect
        x="5"
        y="11"
        width="14"
        height="10"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M8 11V7a4 4 0 018 0v4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
