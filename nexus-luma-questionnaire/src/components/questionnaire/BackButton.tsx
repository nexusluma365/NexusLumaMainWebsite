import { ArrowLeft } from "lucide-react";

interface BackButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

export function BackButton({ onClick, disabled }: BackButtonProps) {
  return (
    <button
      type="button"
      className="nq-back-button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Go back to the previous question"
    >
      <ArrowLeft size={18} strokeWidth={2.25} aria-hidden="true" />
    </button>
  );
}
