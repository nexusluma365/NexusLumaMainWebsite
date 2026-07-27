import type { ScreenId, ServicePath } from "../types/questionnaire";
import { getQuestionStepIndex, getTotalQuestionSteps } from "../config/questionnaireRoutes";

export interface ProgressInfo {
  currentStep: number;
  totalSteps: number;
  percent: number;
  label: string;
}

/**
 * Computes branch-aware progress. The "total" includes the question screens
 * plus the contact screen, so 100% is only reached once contact info is
 * being collected / the result has been reached — never before.
 */
export function getProgress(
  screen: ScreenId,
  currentQuestionId: string | null,
  activePath: ServicePath | null
): ProgressInfo {
  const totalQuestionSteps = getTotalQuestionSteps(activePath);
  const totalSteps = totalQuestionSteps + 1; // + contact info step

  if (screen === "welcome") {
    return { currentStep: 0, totalSteps, percent: 0, label: "Getting started" };
  }

  if (screen === "question" && currentQuestionId) {
    const step = getQuestionStepIndex(currentQuestionId, activePath);
    const percent = Math.round((step / totalSteps) * 100);
    return {
      currentStep: step,
      totalSteps,
      percent,
      label: `Question ${step} of ${totalQuestionSteps}`,
    };
  }

  if (screen === "contact") {
    const percent = Math.round((totalQuestionSteps / totalSteps) * 100);
    return {
      currentStep: totalQuestionSteps + 1,
      totalSteps,
      percent,
      label: "Almost done",
    };
  }

  // recommendation / low-intent / submission-error / completed
  return {
    currentStep: totalSteps,
    totalSteps,
    percent: 100,
    label: "Complete",
  };
}
