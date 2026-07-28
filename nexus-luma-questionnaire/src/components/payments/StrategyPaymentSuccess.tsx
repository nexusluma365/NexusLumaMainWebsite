import { useEffect } from "react";

interface StrategyPaymentSuccessProps {
  headline: string;
  text: string;
  buttonLabel: string;
  bookingUrl: string;
  autoRedirect: boolean;
  onBookingClick: () => void;
}

export function StrategyPaymentSuccess({
  headline,
  text,
  buttonLabel,
  bookingUrl,
  autoRedirect,
  onBookingClick,
}: StrategyPaymentSuccessProps) {
  const redirecting = autoRedirect;

  useEffect(() => {
    if (!autoRedirect) return;
    const timeout = setTimeout(() => {
      onBookingClick();
      window.location.assign(bookingUrl);
    }, 2400);
    return () => clearTimeout(timeout);
  }, [autoRedirect, bookingUrl, onBookingClick]);

  if (redirecting) {
    return (
      <div className="nl-success-wrap nl-success-wrap--redirect" role="status" aria-live="polite">
        <h2 className="nl-success-headline">Thank You For Your Purchase</h2>
        <p className="nl-success-text">Now it's time to schedule your strategy call.</p>
        <p className="nl-redirect-note">Taking you to Zoom...</p>
      </div>
    );
  }

  return (
    <div className="nl-success-wrap" role="status" aria-live="polite">
      <div className="nl-success-icon">
        <CheckCircleIcon />
      </div>
      <h2 className="nl-success-headline">{headline}</h2>
      <p className="nl-success-text">{text}</p>

      <a
        className="nl-submit-btn"
        href={bookingUrl}
        onClick={onBookingClick}
        style={{ textDecoration: "none" }}
      >
        {buttonLabel}
      </a>

      <p className="nl-success-meta">
        A receipt has been sent to your email. Your $99 payment is credited toward your
        project if you move forward with Nexus Luma.
      </p>
    </div>
  );
}

function CheckCircleIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 12.5l4.5 4.5L19 7"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
