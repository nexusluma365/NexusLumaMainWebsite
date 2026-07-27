

interface StrategyPaymentErrorProps {
  message: string;
}

export function StrategyPaymentError({ message }: StrategyPaymentErrorProps) {
  return (
    <div className="nl-error-box" role="alert">
      <AlertIcon />
      <span>{message}</span>
    </div>
  );
}

function AlertIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 9v4m0 4h.01M10.3 3.86L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.86a2 2 0 00-3.4 0z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
