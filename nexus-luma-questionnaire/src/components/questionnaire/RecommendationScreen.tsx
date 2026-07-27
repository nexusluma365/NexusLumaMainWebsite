import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import {
  SalesFunnelPaymentModal,
  WebsiteDesignPaymentModal,
  type StrategyPaymentResult,
} from "../payments";
import type { ContactInformation, RecommendedService } from "../../types/questionnaire";
import { DEFAULT_PAYMENT_LINKS } from "../../config/paymentLinks";
import { buildQuestionnaireLeadId } from "../../utils/leadId";

interface RecommendationScreenProps {
  recommendedService: Exclude<RecommendedService, "email-follow-up">;
  bookingUrl: string;
  websiteBookingUrl: string;
  contactInformation: ContactInformation | null;
  questionnaireAnswers: Record<string, string>;
  onBookingClick: () => void;
  onGoBack: () => void;
  onPaymentSuccess?: (result: StrategyPaymentResult) => void;
  onAnalyticsEvent?: (eventName: string, eventData?: Record<string, unknown>) => void;
}

const COPY = {
  "sales-funnel-strategy": {
    headline: "A Sales Funnel Strategy Session Is Your Best Next Step",
    supporting:
      "Based on your answers, your business may need a clearer system for turning attention into leads and customers.",
    benefits: [
      "Review how customers currently find your business",
      "Identify where leads or sales may be getting lost",
      "Map out the right funnel for your offer",
      "Create a clear next-step plan",
      "Answer your questions",
    ],
    bookLabel: "Pay $99 & Book My Sales Funnel Session",
  },
  "website-strategy": {
    headline: "A Website Strategy Session Is Your Best Next Step",
    supporting:
      "Based on your answers, your business may benefit from a stronger website that builds trust and supports your goals.",
    benefits: [
      "Review your current website or business idea",
      "Identify what your website needs",
      "Discuss the pages and features required",
      "Create a clear website plan",
      "Answer your questions",
    ],
    bookLabel: "Pay $99 & Book My Website Strategy Session",
  },
} as const;

export function RecommendationScreen({
  recommendedService,
  bookingUrl,
  websiteBookingUrl,
  contactInformation,
  questionnaireAnswers,
  onBookingClick,
  onGoBack,
  onPaymentSuccess,
  onAnalyticsEvent,
}: RecommendationScreenProps) {
  const copy = COPY[recommendedService];
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const leadId = useMemo(
    () => buildQuestionnaireLeadId(recommendedService, contactInformation),
    [recommendedService, contactInformation]
  );

  const customer = {
    firstName: contactInformation?.firstName,
    email: contactInformation?.email,
    phone: contactInformation?.phone,
    businessName: contactInformation?.businessName,
  };

  const sharedPaymentProps = {
    isOpen: isPaymentOpen,
    leadId,
    customer,
    questionnaireAnswers,
    salesFunnelBookingUrl:
      recommendedService === "sales-funnel-strategy" ? bookingUrl : DEFAULT_PAYMENT_LINKS.salesFunnelBookingUrl,
    websiteDesignBookingUrl:
      recommendedService === "website-strategy" ? bookingUrl : websiteBookingUrl,
    paymentPolicyUrl: DEFAULT_PAYMENT_LINKS.paymentPolicyUrl,
    onClose: () => setIsPaymentOpen(false),
    onPaymentSuccess,
    onAnalyticsEvent,
  };

  const handlePaymentOpen = () => {
    onBookingClick();
    setIsPaymentOpen(true);
  };

  return (
    <>
      <motion.div
        className="nq-result"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        <h2 className="nq-headline" tabIndex={-1}>
          {copy.headline}
        </h2>
        <p className="nq-supporting-text">{copy.supporting}</p>

        <p className="nq-eyebrow">During Your Strategy Session, We'll:</p>
        <ul className="nq-benefits">
          {copy.benefits.map((benefit) => (
            <li key={benefit}>
              <span className="nq-benefits__icon" aria-hidden="true">
                <Check size={12} strokeWidth={3} />
              </span>
              <span>{benefit}</span>
            </li>
          ))}
        </ul>

        <div className="nq-price-card">
          <p className="nq-price-card__amount">$99 Strategy Session</p>
          <p className="nq-price-card__note">
            Your $99 is credited toward your project if you decide to move forward with Nexus Luma.
          </p>
        </div>

        <div className="nq-result__actions">
          <button type="button" className="nq-button nq-button--primary" onClick={handlePaymentOpen}>
            {copy.bookLabel}
          </button>
          <button type="button" className="nq-button nq-button--ghost" onClick={onGoBack}>
            Go Back
          </button>
        </div>
      </motion.div>

      {recommendedService === "sales-funnel-strategy" && <SalesFunnelPaymentModal {...sharedPaymentProps} />}
      {recommendedService === "website-strategy" && <WebsiteDesignPaymentModal {...sharedPaymentProps} />}
    </>
  );
}
