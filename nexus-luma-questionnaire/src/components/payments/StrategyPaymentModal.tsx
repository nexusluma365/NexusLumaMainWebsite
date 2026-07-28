import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import type { Stripe, StripeElementsOptions } from "@stripe/stripe-js";
import { ModalOverlay } from "./ModalOverlay";
import { PaymentModalErrorBoundary } from "./PaymentModalErrorBoundary";
import { StrategyPaymentForm } from "./StrategyPaymentForm";
import { StrategyPaymentSuccess } from "./StrategyPaymentSuccess";
import { useStrategyPayment } from "../../hooks/useStrategyPayment";
import { useModalFocusTrap } from "../../hooks/useModalFocusTrap";
import { usePaymentAnalytics } from "../../hooks/usePaymentAnalytics";
import { getStrategyContent } from "../../config/strategyPaymentContent";
import { readStripePublishableKey } from "../../utils/readStripePublishableKey";
import { formatWholeDollar } from "../../utils/formatCurrency";
import { AUTO_REDIRECT_AFTER_PAYMENT } from "../../config/paymentLinks";
import type { StrategyPaymentModalProps, StrategyPaymentResult } from "../../types/strategyPayment";
import "./strategyPaymentModal.css";

// Cache the loadStripe() promise per publishable key so we never call it
// more than once for the same key (loadStripe injects a <script> tag).
const stripePromiseCacheByKey = new Map<string, Promise<Stripe | null>>();
function getStripePromise(key: string) {
  let cached = stripePromiseCacheByKey.get(key);
  if (!cached) {
    cached = loadStripe(key);
    stripePromiseCacheByKey.set(key, cached);
  }
  return cached;
}

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
    stripePublishableKey,
    onClose,
    onPaymentSuccess,
    onAnalyticsEvent,
  } = props;

  const resolvedKey = useMemo(
    () => readStripePublishableKey(stripePublishableKey),
    [stripePublishableKey]
  );
  const [remotePublishableKey, setRemotePublishableKey] = useState<string | undefined>();
  const [stripeConfigStatus, setStripeConfigStatus] = useState<
    "idle" | "loading" | "ready" | "failed"
  >("idle");
  const activeStripeKey = resolvedKey || remotePublishableKey;

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

  useEffect(() => {
    if (!isOpen || resolvedKey || remotePublishableKey) return;

    let cancelled = false;
    setStripeConfigStatus("loading");

    fetch("/api/stripe-config")
      .then(async (response) => {
        if (!response.ok) throw new Error("Stripe config request failed.");
        const payload = (await response.json()) as { publishableKey?: string };
        if (!payload.publishableKey) throw new Error("Stripe publishable key missing.");
        if (!cancelled) {
          setRemotePublishableKey(payload.publishableKey);
          setStripeConfigStatus("ready");
        }
      })
      .catch((error) => {
        console.error("[StrategyPaymentModal] Stripe config could not be loaded.", error);
        if (!cancelled) setStripeConfigStatus("failed");
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, remotePublishableKey, resolvedKey]);

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
    track("strategy_payment_completed", { paymentIntentId: result.paymentIntentId });
    onPaymentSuccess?.(result);

    if (result.bookingUrl) {
      track("strategy_booking_clicked");
      window.location.assign(result.bookingUrl);
      return;
    }

    setSuccessResult(result);
  }

  const elementsOptions: StripeElementsOptions = {
    appearance: {
      theme: "stripe",
      variables: {
        colorPrimary: "#4d61d8",
        colorBackground: "#ffffff",
        colorText: "#222638",
        colorTextSecondary: "#6e7388",
        colorDanger: "#d63f3f",
        fontFamily: "Inter, system-ui, sans-serif",
        borderRadius: "6px",
        spacingUnit: "4px",
      },
      rules: {
        ".Input": {
          border: "1px solid #d9deea",
          backgroundColor: "#ffffff",
          borderRadius: "6px",
          padding: "14px 18px",
        },
        ".Tab": {
          border: "1px solid #d9deea",
          backgroundColor: "#ffffff",
          borderRadius: "6px",
        },
        ".Tab--selected": {
          border: "1px solid #4d61d8",
        },
      },
    },
  };

  if (isOpen && stripeConfigStatus === "failed" && !activeStripeKey) {
    // Fail loudly in development rather than silently rendering a broken form.
    console.error(
      "[StrategyPaymentModal] No Stripe publishable key found. Pass `stripePublishableKey` " +
        "as a prop, set VITE_STRIPE_PUBLISHABLE_KEY at build time, or configure " +
        "STRIPE_PUBLISHABLE_KEY for /api/stripe-config. See .env.example."
    );
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

              {activeStripeKey ? (
                <Elements stripe={getStripePromise(activeStripeKey)} options={elementsOptions}>
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
                </Elements>
              ) : stripeConfigStatus === "loading" ? (
                <div className="nl-payment-form">
                  <div className="nl-loading-box" role="status">
                    Loading secure checkout...
                  </div>
                </div>
              ) : (
                <UnavailableCheckout content={content} paymentPolicyUrl={paymentPolicyUrl} />
              )}
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

function UnavailableCheckout({
  content,
  paymentPolicyUrl,
}: {
  content: ReturnType<typeof getStrategyContent>;
  paymentPolicyUrl?: string;
}) {
  return (
    <div className="nl-payment-form">
      <div className="nl-checkout-grid">
        <section className="nl-payment-column" aria-labelledby="nl-payment-unavailable-title">
          <div className="nl-section-header">
            <h3 id="nl-payment-unavailable-title">Payment Method</h3>
            <span className="nl-secure-label">Secure Server</span>
          </div>

          <div className="nl-payment-method-card nl-payment-method-card--empty">
            <div className="nl-payment-method-head">
              <label className="nl-radio-label">
                <span className="nl-radio-dot" aria-hidden="true" />
                Credit Card
              </label>
              <span className="nl-card-brands" aria-label="Major cards accepted">
                Visa
              </span>
            </div>

            <div className="nl-unavailable-box" role="alert">
              <p className="nl-unavailable-title">Payment setup is not connected yet</p>
              <p>
                Add your Stripe publishable key to this app and run the payment server with
                your Stripe secret key to enable this checkout.
              </p>
            </div>
          </div>
        </section>

        <aside className="nl-summary-column" aria-labelledby="nl-unavailable-summary-title">
          <div className="nl-summary-top">
            <h3 id="nl-unavailable-summary-title">Booking Summary</h3>
            <img className="nl-summary-logo" src={`${ASSET_BASE}Nexus%20Luma%20Logo.png`} alt="Nexus Luma" />
          </div>

          <div className="nl-summary-divider" />

          <p className="nl-summary-service">{content.priceLabel}</p>
          <p className="nl-summary-copy">{content.description}</p>

          <dl className="nl-summary-details">
            <div>
              <dt>Session</dt>
              <dd>Strategy Call</dd>
            </div>
            <div>
              <dt>Credit</dt>
              <dd>Applied to project</dd>
            </div>
          </dl>

          <div className="nl-summary-divider nl-summary-divider--dashed" />

          <dl className="nl-summary-totals">
            <div>
              <dt>Subtotal</dt>
              <dd>{formatWholeDollar(content.price)}</dd>
            </div>
            <div>
              <dt>Discount</dt>
              <dd>$0</dd>
            </div>
            <div>
              <dt>Taxes & Fees</dt>
              <dd>$0</dd>
            </div>
          </dl>

          <div className="nl-summary-divider" />

          <div className="nl-summary-total">
            <span>Total</span>
            <strong>{formatWholeDollar(content.price)}</strong>
          </div>

          <button type="button" className="nl-submit-btn" disabled>
            Make payment
          </button>

          {paymentPolicyUrl && (
            <a
              className="nl-policy-link"
              href={paymentPolicyUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Payment policy
            </a>
          )}
        </aside>
      </div>
    </div>
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
