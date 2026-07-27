import type { ReactNode } from "react";
import { BackButton } from "./BackButton";
import { ProgressIndicator } from "./ProgressIndicator";
import type { ProgressInfo } from "../../utils/questionnaireProgress";

interface QuestionnaireLayoutProps {
  /** Should already contain an AnimatePresence-driven motion element, keyed by the caller. */
  children: ReactNode;
  showBackButton: boolean;
  showProgress: boolean;
  onBack: () => void;
  backDisabled?: boolean;
  progress: ProgressInfo;
}

export function QuestionnaireLayout({
  children,
  showBackButton,
  showProgress,
  onBack,
  backDisabled,
  progress,
}: QuestionnaireLayoutProps) {
  return (
    <div className="nq-root">
      <div className="nq-background">
        <div className="nq-card">
          <div className="nq-card__inner">
            <div className="nq-card__top-row">
              {showBackButton ? (
                <BackButton onClick={onBack} disabled={backDisabled} />
              ) : (
                <span className="nq-back-spacer" aria-hidden="true" />
              )}
              {showProgress ? <ProgressIndicator progress={progress} /> : <span />}
            </div>
            <div className="nq-card__body">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
