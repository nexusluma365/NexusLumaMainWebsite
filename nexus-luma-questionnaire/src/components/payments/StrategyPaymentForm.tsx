import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  CardCvcElement,
  CardExpiryElement,
  CardNumberElement,
} from "@stripe/react-stripe-js";
import type { StripeCardNumberElementChangeEvent } from "@stripe/stripe-js";
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
const CARD_ELEMENT_STYLE = {
  base: {
    color: "#222638",
    fontFamily: "Inter, system-ui, sans-serif",
    fontSize: "16px",
    fontSmoothing: "antialiased",
    "::placeholder": {
      color: "#8b91a3",
    },
  },
  invalid: {
    color: "#d63f3f",
    iconColor: "#d63f3f",
  },
};

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
  onFormInteracted,
}: StrategyPaymentFormProps) {
  const initialBillingName = useMemo(
    () => [customer?.firstName, customer?.lastName].filter(Boolean).join(" ").trim(),
    [customer?.firstName, customer?.lastName]
  );
  const initialEmail = customer?.email?.trim() ?? "";
  const initialPhone = customer?.phone?.trim() ?? "";

  const [billingName, setBillingName] = useState(initialBillingName);
  const [email, setEmail] = useState(initialEmail);
  const [phone, setPhone] = useState(initialPhone);
  const [cardNumberComplete, setCardNumberComplete] = useState(false);
  const [cardExpiryComplete, setCardExpiryComplete] = useState(false);
  const [cardCvcComplete, setCardCvcComplete] = useState(false);
  const [cardBrand, setCardBrand] = useState("Card");
  const [interacted, setInteracted] = useState(false);

  useEffect(() => {
    setBillingName(initialBillingName);
    setEmail(initialEmail);
    setPhone(initialPhone);
  }, [initialBillingName, initialEmail, initialPhone]);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const formValid = emailValid && billingName.length > 1;
  const cardValid = cardNumberComplete && cardExpiryComplete && cardCvcComplete;

  const isProcessing = status === "processing";
  const isPending = status === "pending";
  const disabled = !formValid || !cardValid || isProcessing || isPending;

  const buttonText = isProcessing || isPending ? loadingLabel : paymentButtonLabel;

  function markInteracted() {
    if (!interacted) {
      setInteracted(true);
      onFormInteracted();
    }
  }

  function handleCardNumberChange(event: StripeCardNumberElementChangeEvent) {
    setCardNumberComplete(event.complete);
    if (event.brand && event.brand !== "unknown") {
      setCardBrand(event.brand.toUpperCase());
    }
  }

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
                {cardBrand}
              </span>
            </div>

            <p className="nl-payment-method-copy">
              Your contact details are prefilled from the questionnaire. Add your card details below to complete payment.
            </p>

            {!formValid && (
              <p className="nl-field-error nl-field-error--standalone">
                Contact information is missing. Please go back and enter your name and email.
              </p>
            )}

            <div className="nl-customer-grid">
              <label className="nl-form-group">
                <span className="nl-label">Cardholder name</span>
                <input
                  className="nl-input"
                  type="text"
                  autoComplete="cc-name"
                  value={billingName}
                  onChange={(event) => setBillingName(event.target.value)}
                  onFocus={markInteracted}
                  aria-invalid={billingName.length <= 1}
                />
              </label>

              <label className="nl-form-group">
                <span className="nl-label">Email receipt</span>
                <input
                  className="nl-input"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  onFocus={markInteracted}
                  aria-invalid={!emailValid}
                />
              </label>

              <label className="nl-form-group nl-form-group--full">
                <span className="nl-label">Phone</span>
                <input
                  className="nl-input"
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  onFocus={markInteracted}
                  placeholder="Optional"
                />
              </label>
            </div>

            <div className="nl-card-field-grid">
              <label className="nl-form-group nl-form-group--full">
                <span className="nl-label">Card number</span>
                <div className="nl-stripe-input">
                  <CardNumberElement
                    onFocus={markInteracted}
                    onChange={handleCardNumberChange}
                    options={{
                      showIcon: true,
                      style: CARD_ELEMENT_STYLE,
                    }}
                  />
                </div>
              </label>

              <label className="nl-form-group">
                <span className="nl-label">Expiration</span>
                <div className="nl-stripe-input">
                  <CardExpiryElement
                    onFocus={markInteracted}
                    onChange={(event) => setCardExpiryComplete(event.complete)}
                    options={{ style: CARD_ELEMENT_STYLE }}
                  />
                </div>
              </label>

              <label className="nl-form-group">
                <span className="nl-label">CVC</span>
                <div className="nl-stripe-input">
                  <CardCvcElement
                    onFocus={markInteracted}
                    onChange={(event) => setCardCvcComplete(event.complete)}
                    options={{ style: CARD_ELEMENT_STYLE }}
                  />
                </div>
              </label>
            </div>

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
