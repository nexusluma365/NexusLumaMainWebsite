import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ModalOverlay } from "./ModalOverlay";
import { PaymentModalErrorBoundary } from "./PaymentModalErrorBoundary";
import { StrategyPaymentForm } from "./StrategyPaymentForm";
import { StrategyPaymentSuccess } from "./StrategyPaymentSuccess";
import { useStrategyPayment } from "../../hooks/useStrategyPayment";
import { useModalFocusTrap } from "../../hooks/useModalFocusTrap";
import { usePaymentAnalytics } from "../../hooks/usePaymentAnalytics";
import { getStrategyContent } from "../../config/strategyPaymentContent";
import { AUTO_REDIRECT_AFTER_PAYMENT } from "../../config/paymentLinks";
import type { StrategyPaymentModalProps, StrategyPaymentResult } from "../../types/strategyPayment";
import "./strategyPaymentModal.css";

const ASSET_BASE = import.meta.env.BASE_URL || "/";

/**
 * StrategyPaymentModal — one reusable, Stripe-backed payment modal that
 * renders either the Sales Funnel or Website Design strategy-session
 * experience based on `serviceType`.
 */
export function StrategyPaymentModal(props: StrategyPaymentModalProps) {
  const {
    isOpen,
    serviceType,
    leadId = "unknown-lead",
    customer,
    questionnaireAnswers,
    salesFunnelBookingUrl,
    websiteDesignBookingUrl,
    paymentPolicyUrl,
    autoRedirectAfterPayment = AUTO_REDIRECT_AFTER_PAYMENT,
    onClose,
    onPaymentSuccess,
    onAnalyticsEvent,
  } = props;

  const content = useMemo(() => getStrategyContent(serviceType), [serviceType]);
  const bookingUrl =
    content.bookingUrlKey === "salesFunnelBookingUrl"
      ? salesFunnelBookingUrl
      : websiteDesignBookingUrl;

  const titleId = useId();
  const descriptionId = useId();

  const [successResult, setSuccessResult] = useState<StrategyPaymentResult | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const openedAtRef = useRef<number | null>(null);
  const outcomeReachedRef = useRef(false);

  const { track, resetTerminalGuard } = usePaymentAnalytics({
    serviceType,
    leadId,
    questionnairePath: questionnaireAnswers ? Object.keys(questionnaireAnswers).join(",") : undefined,
    onAnalyticsEvent,
  });

  const containerRef = useModalFocusTrap(isOpen);

  // Fire "opened" once per open, and track abandonment if closed without
  // reaching a terminal (success) outcome.
  useEffect(() => {
    if (isOpen) {
      openedAtRef.current = Date.now();
      outcomeReachedRef.current = false;
      resetTerminalGuard();
      setSuccessResult(null);
      track("strategy_payment_modal_opened");
    } else if (openedAtRef.current && !outcomeReachedRef.current) {
      track("strategy_payment_abandoned");
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleClose() {
    if (isBusy) return;
    onClose();
  }

  function handlePaymentSuccess(result: StrategyPaymentResult) {
    outcomeReachedRef.current = true;
    setIsBusy(false);
    setSuccessResult(result);
    track("strategy_payment_completed", { paymentIntentId: result.paymentIntentId });
    onPaymentSuccess?.(result);
  }

  return (
    <ModalOverlay
      isOpen={isOpen}
      onRequestClose={handleClose}
      isBusy={isBusy}
      labelledBy={titleId}
      describedBy={descriptionId}
      closeButton={
        <button
          type="button"
          className="nl-close-btn"
          aria-label="Close payment dialog"
          onClick={handleClose}
          disabled={isBusy}
        >
          <CloseIcon />
        </button>
      }
    >
      <div ref={containerRef} className="nl-modal-inner">
        <PaymentModalErrorBoundary>
          <div className="nl-brand-row">
            <img className="nl-brand-logo" src={`${ASSET_BASE}Nexus%20Luma%20Logo.png`} alt="Nexus Luma" />
          </div>

          {successResult ? (
            <StrategyPaymentSuccess
              headline={content.successHeadline}
              text={content.successText}
              buttonLabel={content.successButtonLabel}
              bookingUrl={successResult.bookingUrl}
              autoRedirect={autoRedirectAfterPayment}
              onBookingClick={() => track("strategy_booking_clicked")}
            />
          ) : (
            <>
              <div className="nl-checkout-intro">
                <p className="nl-eyebrow">{content.eyebrow}</p>
                <h2 id={titleId} className="nl-headline">
                  {content.headline}
                </h2>
                <p id={descriptionId} className="nl-description">
                  {content.whatHappensNext}
                </p>
              </div>

              <ConnectedForm
                serviceType={serviceType}
                leadId={leadId}
                customer={customer}
                content={content}
                questionnaireAnswers={questionnaireAnswers}
                bookingUrl={bookingUrl}
                amount={content.price}
                paymentPolicyUrl={paymentPolicyUrl}
                descriptionId={descriptionId}
                onBusyChange={setIsBusy}
                onSuccess={handlePaymentSuccess}
                onFormViewed={() => track("strategy_payment_form_viewed")}
                onInteracted={() => track("strategy_payment_started")}
                onFailed={(detail) =>
                  track("strategy_payment_failed", { detail: String(detail) })
                }
              />
            </>
          )}
        </PaymentModalErrorBoundary>
      </div>
    </ModalOverlay>
  );
}


interface ConnectedFormProps {
  serviceType: StrategyPaymentModalProps["serviceType"];
  leadId: string;
  customer: StrategyPaymentModalProps["customer"];
  questionnaireAnswers: StrategyPaymentModalProps["questionnaireAnswers"];
  bookingUrl: string;
  amount: number;
  content: ReturnType<typeof getStrategyContent>;
  paymentPolicyUrl?: string;
  descriptionId: string;
  onBusyChange: (busy: boolean) => void;
  onSuccess: (result: StrategyPaymentResult) => void;
  onFormViewed: () => void;
  onInteracted: () => void;
  onFailed: (detail: unknown) => void;
}

function ConnectedForm({
  serviceType,
  leadId,
  customer,
  questionnaireAnswers,
  bookingUrl,
  amount,
  content,
  paymentPolicyUrl,
  descriptionId,
  onBusyChange,
  onSuccess,
  onFormViewed,
  onInteracted,
  onFailed,
}: ConnectedFormProps) {
  const { status, errorMessage, submitPayment, resetError } = useStrategyPayment({
    serviceType,
    leadId,
    customer,
    questionnaireAnswers,
    bookingUrl,
    amount,
    onSuccess,
    onEvent: (event, detail) => {
      onBusyChange(event === "started");
      if (event === "failed") onFailed(detail);
    },
  });

  const viewedRef = useRef(false);
  useEffect(() => {
    if (!viewedRef.current) {
      viewedRef.current = true;
      onFormViewed();
    }
  }, [onFormViewed]);

  return (
    <StrategyPaymentForm
      status={status}
      errorMessage={errorMessage}
      customer={customer}
      content={content}
      paymentButtonLabel={content.paymentButtonLabel}
      loadingLabel={content.loadingLabel}
      paymentPolicyUrl={paymentPolicyUrl}
      descriptionId={descriptionId}
      onSubmit={submitPayment}
      onDismissError={resetError}
      onFormInteracted={onInteracted}
    />
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
