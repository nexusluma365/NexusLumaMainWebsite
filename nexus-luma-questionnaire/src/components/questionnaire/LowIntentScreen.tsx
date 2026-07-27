import { motion } from "framer-motion";

interface LowIntentScreenProps {
  homeUrl: string;
  onReviewAnswers?: () => void;
}

export function LowIntentScreen({ homeUrl, onReviewAnswers }: LowIntentScreenProps) {
  return (
    <motion.div
      className="nq-result"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      <h2 className="nq-headline" tabIndex={-1}>
        Thanks for Reaching Out
      </h2>
      <p className="nq-supporting-text">
        Based on your answers, we'll send helpful information to your email and keep your business needs on file.
      </p>
      <p className="nq-supporting-text">When you're ready to take the next step, Nexus Luma will be here to help.</p>

      <div className="nq-result__actions">
        <a href={homeUrl} className="nq-button nq-button--primary">
          Return to Nexus Luma
        </a>
        {onReviewAnswers && (
          <button type="button" className="nq-button nq-button--ghost" onClick={onReviewAnswers}>
            Review My Answers
          </button>
        )}
      </div>
    </motion.div>
  );
}
