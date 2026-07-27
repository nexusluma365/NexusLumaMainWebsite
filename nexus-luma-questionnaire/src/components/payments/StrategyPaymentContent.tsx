
import type { StrategyModalContent } from "../../types/strategyPayment";
import { ProjectCreditCallout } from "./ProjectCreditCallout";
import { formatWholeDollar } from "../../utils/formatCurrency";

interface StrategyPaymentContentProps {
  content: StrategyModalContent;
  titleId: string;
  descriptionId: string;
  showValueComparison: boolean;
}

export function StrategyPaymentContent({
  content,
  titleId,
  descriptionId,
  showValueComparison,
}: StrategyPaymentContentProps) {
  return (
    <>
      <p className="nl-eyebrow">{content.eyebrow}</p>
      <h2 id={titleId} className="nl-headline">
        {content.headline}
      </h2>
      <p id={descriptionId} className="nl-description">
        {content.description}
      </p>

      <p className="nl-section-label">{content.benefitsIntro}</p>
      <ul className="nl-benefits">
        {content.benefits.map((benefit) => (
          <li key={benefit}>
            <CheckIcon />
            <span>{benefit}</span>
          </li>
        ))}
      </ul>

      <div className="nl-price-row">
        <span className="nl-price-amount">{formatWholeDollar(content.price)}</span>
        <span className="nl-price-label">{content.priceLabel}</span>
      </div>

      <ProjectCreditCallout heading={content.creditHeading} text={content.creditMessage} />

      <p className="nl-risk-text">{content.riskReductionMessage}</p>

      {showValueComparison && (
        <div className="nl-value-box">
          <p className="nl-value-heading">{content.valueComparisonHeading}</p>
          <p className="nl-value-text">{content.valueComparisonText}</p>
        </div>
      )}

      <hr className="nl-divider" />
    </>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 12.5l4.5 4.5L19 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
