import type { ServicePath } from "../types/questionnaire";
import {
  PRIMARY_QUESTION_ID,
  SALES_FUNNEL_QUESTION_IDS,
  WEBSITE_QUESTION_IDS,
} from "./questionnaireConfig";

// ---------------------------------------------------------------------------
// Routing engine
//
// Determines the next/previous step from: current step, selected answer,
// active path, and (implicitly, via the reducer) navigation history.
// Keeping this separate from the reducer/components means a new branch can
// be added by extending the two lookup tables below.
// ---------------------------------------------------------------------------

const PRIMARY_GOAL_TO_PATH: Record<string, ServicePath> = {
  "get-more-customers": "sales-funnel",
  "sell-more-products": "sales-funnel",
  "build-my-brand": "website",
  "just-need-a-website": "website",
};

const PATH_QUESTION_IDS: Record<ServicePath, string[]> = {
  "sales-funnel": SALES_FUNNEL_QUESTION_IDS,
  website: WEBSITE_QUESTION_IDS,
};

export function resolvePathFromPrimaryAnswer(value: string): ServicePath {
  return PRIMARY_GOAL_TO_PATH[value] ?? "website";
}

export function getBranchQuestionIds(path: ServicePath): string[] {
  return PATH_QUESTION_IDS[path];
}

/** Total number of question screens for a given (possibly unknown) path, used for progress. */
export function getTotalQuestionSteps(path: ServicePath | null): number {
  const branchLength = path ? PATH_QUESTION_IDS[path].length : PATH_QUESTION_IDS["sales-funnel"].length;
  return 1 + branchLength; // primary question + branch questions
}

/** 1-based index of a question within the full flow (primary question is step 1). */
export function getQuestionStepIndex(questionId: string, path: ServicePath | null): number {
  if (questionId === PRIMARY_QUESTION_ID) return 1;
  if (!path) return 1;
  const idx = PATH_QUESTION_IDS[path].indexOf(questionId);
  return idx === -1 ? 1 : idx + 2;
}

/**
 * Given the question that was just answered and the active path, returns the
 * id of the next question, or null if the branch's questions are complete
 * (meaning the flow should advance to the contact information screen).
 */
export function getNextQuestionId(currentQuestionId: string, path: ServicePath): string | null {
  if (currentQuestionId === PRIMARY_QUESTION_ID) {
    return PATH_QUESTION_IDS[path][0];
  }
  const branchIds = PATH_QUESTION_IDS[path];
  const idx = branchIds.indexOf(currentQuestionId);
  if (idx === -1 || idx === branchIds.length - 1) {
    return null;
  }
  return branchIds[idx + 1];
}

/** Given the question the user is going back to (the previous history entry), find the one before it. */
export function isPrimaryQuestion(questionId: string): boolean {
  return questionId === PRIMARY_QUESTION_ID;
}
