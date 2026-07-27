import type { StrategyServiceType, StrategyServiceTypeApi } from "../types/strategyPayment";

const SERVICE_TYPE_API_MAP: Record<StrategyServiceType, StrategyServiceTypeApi> = {
  "sales-funnel": "sales-funnel-strategy",
  "website-design": "website-design-strategy",
};

const SERVICE_NAME_MAP: Record<StrategyServiceType, string> = {
  "sales-funnel": "Sales Funnel Strategy Session",
  "website-design": "Website Design Strategy Session",
};

export function toApiServiceType(serviceType: StrategyServiceType): StrategyServiceTypeApi {
  return SERVICE_TYPE_API_MAP[serviceType];
}

/**
 * Builds the metadata object attached to a Stripe PaymentIntent.
 * Keep this free of sensitive information — metadata is not encrypted
 * at rest the way card data is, and is visible to anyone with dashboard
 * access.
 */
export function buildPaymentMetadata(params: {
  serviceType: StrategyServiceType;
  leadId: string;
  email: string;
}): Record<string, string> {
  return {
    serviceType: toApiServiceType(params.serviceType),
    serviceName: SERVICE_NAME_MAP[params.serviceType],
    leadId: params.leadId,
    email: params.email,
  };
}
