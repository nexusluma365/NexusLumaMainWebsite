import { useEffect, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import type { QuestionnaireAppProps, ContactFieldRequirements, QuestionnaireState } from "../../types/questionnaire";
import { useQuestionnaire } from "../../hooks/useQuestionnaire";
import { useQuestionnaireAnalytics } from "../../hooks/useQuestionnaireAnalytics";
import { useCampaignParameters } from "../../hooks/useCampaignParameters";
import { getProgress } from "../../utils/questionnaireProgress";
import { ANALYTICS_EVENTS } from "../../services/analyticsService";
import { SALES_FUNNEL_BOOKING_URL, WEBSITE_BOOKING_URL, NEXUS_LUMA_HOME_URL } from "../../config/appLinks";

import { QuestionnaireLayout } from "./QuestionnaireLayout";
import { WelcomeScreen } from "./WelcomeScreen";
import { QuestionScreen } from "./QuestionScreen";
import { ContactInformationScreen } from "./ContactInformationScreen";
import { RecommendationScreen } from "./RecommendationScreen";
import { LowIntentScreen } from "./LowIntentScreen";
import { SubmissionErrorScreen } from "./SubmissionErrorScreen";

import "../../styles/questionnaire.css";

const DEFAULT_CONTACT_REQUIREMENTS: ContactFieldRequirements = {
  firstName: true,
  email: true,
  phone: false,
  businessName: false,
  websiteUrl: false,
};

export function QuestionnaireApp({
  salesFunnelBookingUrl = SALES_FUNNEL_BOOKING_URL,
  websiteBookingUrl = WEBSITE_BOOKING_URL,
  homeUrl = NEXUS_LUMA_HOME_URL,
  onComplete,
  onAnalyticsEvent,
  submitLead,
  contactFieldRequirements,
  devMode = false,
  disablePersistence = false,
}: QuestionnaireAppProps) {
  const track = useQuestionnaireAnalytics(onAnalyticsEvent);
  const campaignParameters = useCampaignParameters();

  const { state, currentQuestion, start, selectAnswer, goBack, submitContact, retrySubmission, reviewAnswers, canGoBack } =
    useQuestionnaire({ campaignParameters, track, submitLead, disablePersistence });

  const requirements: ContactFieldRequirements = {
    ...DEFAULT_CONTACT_REQUIREMENTS,
    ...contactFieldRequirements,
  };

  const headingRef = useRef<HTMLHeadingElement>(null);
  const prevScreenKey = useRef<string>("welcome");

  const screenKey = state.screen === "question" ? `question:${state.currentQuestionId}` : state.screen;

  // Move focus to the new question/screen heading after each transition,
  // without an aggressive scroll jump.
  useEffect(() => {
    if (screenKey === prevScreenKey.current) return;
    prevScreenKey.current = screenKey;
    const timeout = window.setTimeout(() => {
      headingRef.current?.focus({ preventScroll: true });
    }, 60);
    return () => window.clearTimeout(timeout);
  }, [screenKey]);

  useEffect(() => {
    if (state.completed && (state.screen === "recommendation" || state.screen === "low-intent")) {
      const result = {
        recommendedService: state.recommendedService!,
        leadIntent: state.leadIntent!,
        path: state.activePath!,
        answers: state.answers,
        contactInformation: state.contactInformation!,
        completedAt: new Date().toISOString(),
        campaignParameters: state.campaignParameters ?? undefined,
      };
      onComplete?.(result);
    }
    // Only fire once when the completed result screen first appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.screen]);

  const progress = getProgress(state.screen, state.currentQuestionId, state.activePath);

  const handleBookingClick = () => {
    track(ANALYTICS_EVENTS.BOOKING_CLICKED, { recommendedService: state.recommendedService });
  };

  const bookingUrl =
    state.recommendedService === "sales-funnel-strategy" ? salesFunnelBookingUrl : websiteBookingUrl;

  const showBackButton = state.screen !== "welcome" && canGoBack;
  const showProgress = state.screen !== "welcome";

  return (
    <>
      <QuestionnaireLayout
        showBackButton={showBackButton}
        showProgress={showProgress}
        onBack={goBack}
        backDisabled={state.isSubmitting}
        progress={progress}
      >
        <AnimatePresence mode="wait" initial={false}>
          {state.screen === "welcome" && <WelcomeScreen key="welcome" onStart={start} />}

          {state.screen === "question" && currentQuestion && (
            <QuestionScreen
              key={screenKey}
              question={currentQuestion}
              savedAnswerValue={state.answers[currentQuestion.answerKey]}
              onSelect={(option) => selectAnswer(currentQuestion.id, currentQuestion.answerKey, option.value)}
              headingRef={headingRef}
            />
          )}

          {state.screen === "contact" && (
            <ContactInformationScreen
              key="contact"
              requirements={requirements}
              isSubmitting={state.isSubmitting}
              onSubmit={submitContact}
            />
          )}

          {state.screen === "recommendation" &&
            (state.recommendedService === "sales-funnel-strategy" || state.recommendedService === "website-strategy") && (
              <RecommendationScreen
                key="recommendation"
                recommendedService={state.recommendedService}
                bookingUrl={bookingUrl}
                websiteBookingUrl={websiteBookingUrl}
                contactInformation={state.contactInformation}
                questionnaireAnswers={state.answers}
                onBookingClick={handleBookingClick}
                onGoBack={goBack}
                onPaymentSuccess={(result) =>
                  track(ANALYTICS_EVENTS.BOOKING_CLICKED, {
                    recommendedService: state.recommendedService,
                    paymentIntentId: result.paymentIntentId,
                    paymentStatus: result.status,
                  })
                }
                onAnalyticsEvent={onAnalyticsEvent}
              />
            )}

          {state.screen === "low-intent" && (
            <LowIntentScreen key="low-intent" homeUrl={homeUrl} onReviewAnswers={reviewAnswers} />
          )}

          {state.screen === "submission-error" && (
            <SubmissionErrorScreen key="submission-error" onRetry={retrySubmission} />
          )}
        </AnimatePresence>
      </QuestionnaireLayout>

      {devMode && <DevPanel state={state} />}
    </>
  );
}

function DevPanel({ state }: { state: QuestionnaireState }) {
  return (
    <pre className="nq-dev-panel" aria-hidden="true">
      {JSON.stringify(state, null, 2)}
    </pre>
  );
}
