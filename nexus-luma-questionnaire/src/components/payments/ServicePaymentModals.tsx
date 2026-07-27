import { StrategyPaymentModal } from "./StrategyPaymentModal";
import type { StrategyPaymentModalProps } from "../../types/strategyPayment";

type OmitServiceType = Omit<StrategyPaymentModalProps, "serviceType">;

/**
 * Sales Funnel Strategy Session payment modal.
 * Thin wrapper around <StrategyPaymentModal serviceType="sales-funnel" />
 * so it can be imported and used as its own named component, while all
 * logic, styling, and Stripe handling stays in one shared implementation.
 */
export function SalesFunnelPaymentModal(props: OmitServiceType) {
  return <StrategyPaymentModal {...props} serviceType="sales-funnel" />;
}

/**
 * Website Design Strategy Session payment modal.
 * Thin wrapper around <StrategyPaymentModal serviceType="website-design" />
 */
export function WebsiteDesignPaymentModal(props: OmitServiceType) {
  return <StrategyPaymentModal {...props} serviceType="website-design" />;
}
