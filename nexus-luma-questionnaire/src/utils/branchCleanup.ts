import type { ServicePath } from "../types/questionnaire";
import { getBranchQuestionIds } from "../config/questionnaireRoutes";
import { questionsById } from "../config/questionnaireConfig";

/**
 * Removes answers that belong to a branch other than `keepPath`.
 * Shared answers (e.g. the primary goal) are always preserved.
 *
 * Note: some answerKeys (e.g. `purchaseIntent`) are intentionally reused by
 * more than one branch's final question. An answer is kept whenever ANY
 * question inside `keepPath` (or a shared question) uses that key — not
 * based on which branch happened to define it first — otherwise a shared
 * key name could be dropped even though the new branch will ask the same
 * question again anyway.
 *
 * This is what prevents stale Sales Funnel answers from leaking into a
 * Website recommendation (or vice versa) after the user changes their
 * first answer and gets rerouted.
 */
export function stripAnswersOutsideBranch(
  answers: Record<string, string>,
  keepPath: ServicePath
): Record<string, string> {
  const keepQuestionIds = new Set(getBranchQuestionIds(keepPath));
  const keepQuestions = Object.values(questionsById).filter(
    (q) => q.path === "shared" || keepQuestionIds.has(q.id)
  );
  const keepAnswerKeys = new Set(keepQuestions.map((q) => q.answerKey));
  const allKnownAnswerKeys = new Set(Object.values(questionsById).map((q) => q.answerKey));

  const next: Record<string, string> = {};
  for (const [answerKey, value] of Object.entries(answers)) {
    // Unknown key (not tied to any configured question) — keep it, it's not ours to clean up.
    if (!allKnownAnswerKeys.has(answerKey)) {
      next[answerKey] = value;
      continue;
    }
    if (keepAnswerKeys.has(answerKey)) {
      next[answerKey] = value;
    }
    // otherwise: drop it, it belongs only to the branch being left
  }

  return next;
}

/**
 * Trims navigation history so it never contains steps from a branch the
 * user is no longer on. Called whenever the active path changes.
 */
export function stripHistoryOutsideBranch<T extends { screen: string; questionId?: string }>(
  history: T[],
  keepPath: ServicePath
): T[] {
  const keepQuestionIds = new Set(getBranchQuestionIds(keepPath));
  return history.filter((entry) => {
    if (entry.screen !== "question" || !entry.questionId) return true;
    const question = questionsById[entry.questionId];
    if (!question) return true;
    if (question.path === "shared") return true;
    return keepQuestionIds.has(entry.questionId);
  });
}
