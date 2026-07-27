import type { ProgressInfo } from "../../utils/questionnaireProgress";

interface ProgressIndicatorProps {
  progress: ProgressInfo;
}

export function ProgressIndicator({ progress }: ProgressIndicatorProps) {
  return (
    <div className="nq-progress">
      <div
        className="nq-progress__track"
        role="progressbar"
        aria-valuenow={progress.percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={progress.label}
      >
        <div className="nq-progress__fill" style={{ width: `${progress.percent}%` }} />
      </div>
      <p className="nq-progress__label">{progress.label}</p>
    </div>
  );
}
