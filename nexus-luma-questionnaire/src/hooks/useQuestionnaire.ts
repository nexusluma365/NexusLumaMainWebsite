import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type {
  CampaignParameters,
  ContactInformation,
  NavigationEntry,
  QuestionnaireAction,
  QuestionnaireResult,
  QuestionnaireState,
  ServicePath,
} from "../types/questionnaire";
import { PRIMARY_QUESTION_ID, questionsById } from "../config/questionnaireConfig";
import { getNextQuestionId, resolvePathFromPrimaryAnswer } from "../config/questionnaireRoutes";
import { stripAnswersOutsideBranch, stripHistoryOutsideBranch } from "../utils/branchCleanup";
import { classifyIntent, getRecommendedService } from "../utils/leadQualification";
import { buildQuestionnaireLeadId } from "../utils/leadId";
import type { AnalyticsHandler } from "../services/analyticsService";
import { ANALYTICS_EVENTS } from "../services/analyticsService";
import { submitQuestionnaireLead } from "../services/questionnaireLeadService";

// ---------------------------------------------------------------------------
// Timing constants (see design spec: confirmation 250-350ms, fade-out
// 200-300ms). These live here so the hook and the UI animation stay in sync.
// ---------------------------------------------------------------------------
export const ANSWER_CONFIRMATION_MS = 320;
export const FADE_OUT_MS = 240;

const STORAGE_KEY = "nexus-luma-questionnaire:v1";

const initialState: QuestionnaireState = {
  screen: "welcome",
  currentQuestionId: null,
  activePath: null,
  answers: {},
  history: [],
  contactInformation: null,
  leadIntent: null,
  recommendedService: null,
  isTransitioning: false,
  isSubmitting: false,
  submissionError: null,
  completed: false,
  campaignParameters: null,
};

function pushHistory(history: NavigationEntry[], entry: NavigationEntry): NavigationEntry[] {
  return [...history, entry];
}

function reducer(state: QuestionnaireState, action: QuestionnaireAction): QuestionnaireState {
  switch (action.type) {
    case "START": {
      return {
        ...state,
        screen: "question",
        currentQuestionId: PRIMARY_QUESTION_ID,
        history: pushHistory(state.history, { screen: "welcome" }),
      };
    }

    case "SELECT_ANSWER": {
      const nextAnswers = { ...state.answers, [action.answerKey]: action.value };
      let nextActivePath = state.activePath;
      let workingAnswers = nextAnswers;
      let workingHistory = state.history;

      if (action.questionId === PRIMARY_QUESTION_ID) {
        const resolvedPath: ServicePath = resolvePathFromPrimaryAnswer(action.value);
        if (resolvedPath !== state.activePath) {
          // Branch changed (or being set for the first time) — clear stale
          // answers/history from whatever branch is no longer active.
          workingAnswers = stripAnswersOutsideBranch(nextAnswers, resolvedPath);
          workingHistory = stripHistoryOutsideBranch(state.history, resolvedPath);
        }
        nextActivePath = resolvedPath;
      }

      return {
        ...state,
        answers: workingAnswers,
        history: workingHistory,
        activePath: nextActivePath,
        isTransitioning: true,
      };
    }

    case "ADVANCE": {
      const historyEntry: NavigationEntry =
        state.screen === "question" && state.currentQuestionId
          ? { screen: "question", questionId: state.currentQuestionId }
          : { screen: state.screen };

      return {
        ...state,
        screen: action.nextScreen,
        currentQuestionId: action.nextQuestionId ?? null,
        history: pushHistory(state.history, historyEntry),
        isTransitioning: false,
      };
    }

    case "GO_BACK": {
      if (state.history.length === 0) return state;
      const previous = state.history[state.history.length - 1];
      const newHistory = state.history.slice(0, -1);
      return {
        ...state,
        screen: previous.screen,
        currentQuestionId: previous.questionId ?? null,
        history: newHistory,
        isTransitioning: false,
        submissionError: null,
      };
    }

    case "SUBMIT_CONTACT_START": {
      return {
        ...state,
        contactInformation: action.contactInformation,
        isSubmitting: true,
        submissionError: null,
      };
    }

    case "SUBMIT_CONTACT_SUCCESS": {
      const recommendedService = action.recommendedService;
      const nextScreen = recommendedService === "email-follow-up" ? "low-intent" : "recommendation";
      return {
        ...state,
        isSubmitting: false,
        submissionError: null,
        leadIntent: action.leadIntent,
        recommendedService,
        screen: nextScreen,
        completed: true,
        history: pushHistory(state.history, { screen: "contact" }),
      };
    }

    case "SUBMIT_CONTACT_ERROR": {
      return {
        ...state,
        isSubmitting: false,
        submissionError: action.error,
        screen: "submission-error",
      };
    }

    case "RETRY_SUBMISSION": {
      return {
        ...state,
        screen: "contact",
        submissionError: null,
      };
    }

    case "SET_CAMPAIGN_PARAMETERS": {
      return { ...state, campaignParameters: action.campaignParameters };
    }

    case "RESET": {
      return { ...initialState, campaignParameters: state.campaignParameters };
    }

    default:
      return state;
  }
}

function loadPersistedState(disabled: boolean): QuestionnaireState | null {
  if (disabled || typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { version: number; state: QuestionnaireState };
    if (parsed.version !== 1) return null;
    // Never resume mid-submission or an errored state — restart those cleanly.
    if (parsed.state.isSubmitting) return { ...parsed.state, isSubmitting: false };
    return parsed.state;
  } catch {
    return null;
  }
}

function persistState(state: QuestionnaireState, disabled: boolean) {
  if (disabled || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, state }));
  } catch {
    // Storage full or unavailable — silently skip persistence.
  }
}

export interface UseQuestionnaireOptions {
  campaignParameters: CampaignParameters;
  track: AnalyticsHandler;
  submitLead?: (result: QuestionnaireResult) => Promise<void>;
  disablePersistence?: boolean;
}

export function useQuestionnaire({
  campaignParameters,
  track,
  submitLead = submitQuestionnaireLead,
  disablePersistence = false,
}: UseQuestionnaireOptions) {
  const [state, dispatch] = useReducer(
    reducer,
    undefined,
    () => loadPersistedState(disablePersistence) ?? initialState
  );

  const hasStartedTracking = useRef(false);

  useEffect(() => {
    dispatch({ type: "SET_CAMPAIGN_PARAMETERS", campaignParameters });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    persistState(state, disablePersistence);
  }, [state, disablePersistence]);

  const currentQuestion = state.currentQuestionId ? questionsById[state.currentQuestionId] : null;

  const start = useCallback(() => {
    dispatch({ type: "START" });
    if (!hasStartedTracking.current) {
      track(ANALYTICS_EVENTS.QUESTIONNAIRE_STARTED);
      hasStartedTracking.current = true;
    }
  }, [track]);

  useEffect(() => {
    if (state.screen === "question" && currentQuestion) {
      track(ANALYTICS_EVENTS.QUESTION_VIEWED, { questionId: currentQuestion.id, path: state.activePath });
    } else if (state.screen === "contact") {
      track(ANALYTICS_EVENTS.CONTACT_FORM_VIEWED);
    } else if (state.screen === "recommendation") {
      track(ANALYTICS_EVENTS.RECOMMENDATION_VIEWED, { recommendedService: state.recommendedService });
    } else if (state.screen === "low-intent") {
      track(ANALYTICS_EVENTS.LOW_INTENT_RESULT_VIEWED);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.screen, state.currentQuestionId]);

  /**
   * Handles the full "select an answer" sequence: save, confirm, fade,
   * route to the next step. Timing matches ANSWER_CONFIRMATION_MS / FADE_OUT_MS.
   */
  const selectAnswer = useCallback(
    (questionId: string, answerKey: string, value: string) => {
      if (state.isTransitioning) return;

      const previousPath = state.activePath;
      dispatch({ type: "SELECT_ANSWER", questionId, answerKey, value });
      track(ANALYTICS_EVENTS.ANSWER_SELECTED, { questionId, answerKey, value });

      const resolvedPath = questionId === PRIMARY_QUESTION_ID ? resolvePathFromPrimaryAnswer(value) : previousPath;

      if (questionId === PRIMARY_QUESTION_ID && resolvedPath !== previousPath) {
        track(ANALYTICS_EVENTS.BRANCH_SELECTED, { path: resolvedPath });
      }

      window.setTimeout(() => {
        if (!resolvedPath) return;
        const nextQuestionId = getNextQuestionId(questionId, resolvedPath);
        if (nextQuestionId) {
          dispatch({ type: "ADVANCE", nextScreen: "question", nextQuestionId });
        } else {
          dispatch({ type: "ADVANCE", nextScreen: "contact" });
        }
      }, ANSWER_CONFIRMATION_MS + FADE_OUT_MS);
    },
    [state.isTransitioning, state.activePath, track]
  );

  const goBack = useCallback(() => {
    if (state.history.length === 0) return;
    track(ANALYTICS_EVENTS.BACK_CLICKED, { fromScreen: state.screen, questionId: state.currentQuestionId });
    dispatch({ type: "GO_BACK" });
  }, [state.history.length, state.screen, state.currentQuestionId, track]);

  const submitContact = useCallback(
    async (contactInformation: ContactInformation) => {
      if (!state.activePath) return;
      dispatch({ type: "SUBMIT_CONTACT_START", contactInformation });
      track(ANALYTICS_EVENTS.CONTACT_FORM_SUBMITTED);

      const purchaseIntentAnswer = state.answers.purchaseIntent ?? "just-gathering-information";
      const leadIntent = classifyIntent(purchaseIntentAnswer);
      const recommendedService = getRecommendedService(state.activePath, leadIntent);

      const result: QuestionnaireResult = {
        leadId:
          recommendedService === "email-follow-up"
            ? undefined
            : buildQuestionnaireLeadId(recommendedService, contactInformation),
        recommendedService,
        leadIntent,
        path: state.activePath,
        answers: state.answers,
        contactInformation,
        completedAt: new Date().toISOString(),
        campaignParameters: state.campaignParameters ?? undefined,
        deviceType: getDeviceType(),
      };

      try {
        await submitLead(result);
        dispatch({ type: "SUBMIT_CONTACT_SUCCESS", leadIntent, recommendedService });
        track(ANALYTICS_EVENTS.LEAD_CLASSIFIED, { leadIntent, recommendedService });
        track(ANALYTICS_EVENTS.QUESTIONNAIRE_COMPLETED, { recommendedService, leadIntent });
        return result;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Something went wrong while saving your results.";
        dispatch({ type: "SUBMIT_CONTACT_ERROR", error: message });
        return null;
      }
    },
    [state.activePath, state.answers, state.campaignParameters, submitLead, track]
  );

  const retrySubmission = useCallback(() => {
    dispatch({ type: "RETRY_SUBMISSION" });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: "RESET" });
    if (!disablePersistence && typeof window !== "undefined") {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
  }, [disablePersistence]);

  const reviewAnswers = useCallback(() => {
    dispatch({
      type: "ADVANCE",
      nextScreen: "question",
      nextQuestionId: PRIMARY_QUESTION_ID,
    });
  }, []);

  return useMemo(
    () => ({
      state,
      currentQuestion,
      start,
      selectAnswer,
      goBack,
      submitContact,
      retrySubmission,
      reset,
      reviewAnswers,
      canGoBack: state.history.length > 0 && state.screen !== "welcome",
    }),
    [state, currentQuestion, start, selectAnswer, goBack, submitContact, retrySubmission, reset, reviewAnswers]
  );
}

function getDeviceType(): "mobile" | "tablet" | "desktop" {
  if (typeof window === "undefined") return "desktop";
  const width = window.innerWidth;
  if (width < 640) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}
