import { motion } from "framer-motion";

interface WelcomeScreenProps {
  onStart: () => void;
}

const ASSET_BASE = import.meta.env.BASE_URL || "/";

export function WelcomeScreen({ onStart }: WelcomeScreenProps) {
  return (
    <motion.div
      className="nq-welcome"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="nq-welcome__badge">
        <img className="nq-welcome__logo" src={`${ASSET_BASE}Nexus%20Luma%20Logo.png`} alt="Nexus Luma" />
      </div>
      <h1 className="nq-headline nq-headline--lg">Let's Find the Right Solution for Your Business</h1>
      <p className="nq-supporting-text">
        Answer a few quick questions so we can recommend the best option for your goals.
      </p>
      <div className="nq-welcome__actions">
        <button type="button" className="nq-button nq-button--primary" onClick={onStart}>
          Let's Start
        </button>
        <p className="nq-welcome__meta">About 30 seconds</p>
      </div>
    </motion.div>
  );
}
