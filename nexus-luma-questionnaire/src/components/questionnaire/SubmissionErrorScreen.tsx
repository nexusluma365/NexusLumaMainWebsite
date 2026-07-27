import { motion } from "framer-motion";

interface SubmissionErrorScreenProps {
  onRetry: () => void;
}

export function SubmissionErrorScreen({ onRetry }: SubmissionErrorScreenProps) {
  return (
    <motion.div
      className="nq-result"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      <h2 className="nq-headline" tabIndex={-1}>
        We Couldn't Save Your Results
      </h2>
      <p className="nq-supporting-text">Your answers are still here. Please try again.</p>

      <div className="nq-result__actions">
        <button type="button" className="nq-button nq-button--primary" onClick={onRetry}>
          Try Again
        </button>
      </div>
    </motion.div>
  );
}
