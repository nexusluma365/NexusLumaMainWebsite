import { useMemo } from "react";
import type { FormEvent } from "react";
import { PaymentTrustMessage } from "./PaymentTrustMessage";
import { StrategyPaymentError } from "./StrategyPaymentError";
import { StrategyPaymentPending } from "./StrategyPaymentPending";
import { formatWholeDollar } from "../../utils/formatCurrency";
import type { PaymentStatus, StrategyCustomer, StrategyModalContent } from "../../types/strategyPayment";

interface StrategyPaymentFormProps {
  status: PaymentStatus;
  errorMessage: string | null;
  customer?: StrategyCustomer;
  content: StrategyModalContent;
  paymentButtonLabel: string;
  loadingLabel: string;
  paymentPolicyUrl?: string;
  descriptionId: string;
  onSubmit: (billingDetails: { name: string; email: string; phone?: string }) => void;
  onDismissError: () => void;
  onFormInteracted: () => void;
}

const ASSET_BASE = import.meta.env.BASE_URL || "/";

export function StrategyPaymentForm({
  status,
  errorMessage,
  customer,
  content,
  paymentButtonLabel,
  loadingLabel,
  paymentPolicyUrl,
  descriptionId,
  onSubmit,
  onDismissError,
  onFormInteracted: _onFormInteracted,
}: StrategyPaymentFormProps) {
  const billingName = useMemo(
    () => [customer?.firstName, customer?.lastName].filter(Boolean).join(" ").trim(),
    [customer?.firstName, customer?.lastName]
  );
  const email = customer?.email?.trim() ?? "";
  const phone = customer?.phone?.trim() ?? "";
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const formValid = emailValid && billingName.length > 1;

  const isProcessing = status === "processing";
  const isPending = status === "pending";
  const disabled = !formValid || isProcessing || isPending;

  const buttonText = isProcessing || isPending ? loadingLabel : paymentButtonLabel;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!formValid || disabled) return;
    onSubmit({ name: billingName, email, phone });
  }

  return (
    <form id="nl-strategy-payment-form" className="nl-payment-form" onSubmit={handleSubmit} noValidate aria-describedby={descriptionId}>
      <div className="nl-checkout-grid">
        <section className="nl-payment-column" aria-labelledby="nl-payment-method-title">
          <div className="nl-section-header">
            <h3 id="nl-payment-method-title">Payment Method</h3>
            <span className="nl-secure-label">Secure Server</span>
          </div>

          {errorMessage && status === "failed" && (
            <div onClick={onDismissError}>
              <StrategyPaymentError message={errorMessage} />
            </div>
          )}
          {isPending && <StrategyPaymentPending />}

          <div className="nl-payment-method-card">
            <div className="nl-payment-method-head">
              <label className="nl-radio-label">
                <span className="nl-radio-dot" aria-hidden="true" />
                Credit Card
              </label>
              <span className="nl-card-brands" aria-label="Major cards accepted">
                Visa
              </span>
            </div>

            <p className="nl-payment-method-copy">
              Secure card payment through Stripe. Your name and email are already attached from the questionnaire.
            </p>

            {!formValid && (
              <p className="nl-field-error nl-field-error--standalone">
                Contact information is missing. Please go back and enter your name and email.
              </p>
            )}

          </div>
        </section>

        <aside className="nl-summary-column" aria-labelledby="nl-summary-title">
          <div className="nl-summary-top">
            <h3 id="nl-summary-title">Booking Summary</h3>
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

          <button type="submit" className="nl-submit-btn" disabled={disabled}>
            {isProcessing || isPending ? <span className="nl-spinner" aria-hidden="true" /> : null}
            {buttonText}
          </button>

          <PaymentTrustMessage />

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
    </form>
  );
}
