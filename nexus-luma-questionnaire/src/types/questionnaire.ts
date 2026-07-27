// ---------------------------------------------------------------------------
// Core domain types for the Nexus Luma questionnaire
// ---------------------------------------------------------------------------

export type ServicePath = "sales-funnel" | "website";

export type LeadIntent = "high" | "medium" | "low";

export type RecommendedService =
  | "sales-funnel-strategy"
  | "website-strategy"
  | "email-follow-up";

export type ScreenId =
  | "welcome"
  | "question"
  | "contact"
  | "recommendation"
  | "low-intent"
  | "submission-error";

export interface QuestionOption {
  /** Stable identifier for the option, unique within its question */
  id: string;
  /** Label shown to the user */
  label: string;
  /** Value stored in the answers map */
  value: string;
  /** Optional explicit override for which step to go to next */
  nextStep?: string;
}

export interface QuestionnaireQuestion {
  /** Unique step id, used for navigation history and routing */
  id: string;
  /** Which branch this question belongs to */
  path: "shared" | "sales-funnel" | "website";
  headline: string;
  supportingText?: string;
  /** Key under which the selected value is stored in `answers` */
  answerKey: string;
  options: QuestionOption[];
}

export interface ContactInformation {
  firstName: string;
  email: string;
  phone?: string;
  businessName?: string;
  websiteUrl?: string;
}

/** Which contact fields are required. Lets Nexus Luma toggle requirements later. */
export interface ContactFieldRequirements {
  firstName: boolean;
  email: boolean;
  phone: boolean;
  businessName: boolean;
  websiteUrl: boolean;
}

export interface CampaignParameters {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  ref?: string;
  landingPageUrl?: string;
  referrer?: string;
}

export interface QuestionnaireResult {
  leadId?: string;
  recommendedService: RecommendedService;
  leadIntent: LeadIntent;
  path: ServicePath;
  answers: Record<string, string>;
  contactInformation: ContactInformation;
  completedAt: string;
  campaignParameters?: CampaignParameters;
  deviceType?: "mobile" | "tablet" | "desktop";
}

// ---------------------------------------------------------------------------
// Navigation / reducer state
// ---------------------------------------------------------------------------

export interface NavigationEntry {
  screen: ScreenId;
  /** Question id when screen === "question" */
  questionId?: string;
}

export interface QuestionnaireState {
  screen: ScreenId;
  /** Id of the question currently on screen (when screen === "question") */
  currentQuestionId: string | null;
  /** Active branch, determined by the primary routing question */
  activePath: ServicePath | null;
  /** All answers collected so far, keyed by answerKey */
  answers: Record<string, string>;
  /** Full navigation history, used for accurate back navigation */
  history: NavigationEntry[];
  contactInformation: ContactInformation | null;
  leadIntent: LeadIntent | null;
  recommendedService: RecommendedService | null;
  isTransitioning: boolean;
  isSubmitting: boolean;
  submissionError: string | null;
  completed: boolean;
  campaignParameters: CampaignParameters | null;
}

export type QuestionnaireAction =
  | { type: "START" }
  | { type: "SELECT_ANSWER"; questionId: string; answerKey: string; value: string }
  | { type: "ADVANCE"; nextScreen: ScreenId; nextQuestionId?: string | null }
  | { type: "GO_BACK" }
  | { type: "SUBMIT_CONTACT_START"; contactInformation: ContactInformation }
  | { type: "SUBMIT_CONTACT_SUCCESS"; leadIntent: LeadIntent; recommendedService: RecommendedService }
  | { type: "SUBMIT_CONTACT_ERROR"; error: string }
  | { type: "RETRY_SUBMISSION" }
  | { type: "SET_CAMPAIGN_PARAMETERS"; campaignParameters: CampaignParameters }
  | { type: "RESET" };

// ---------------------------------------------------------------------------
// Public component props
// ---------------------------------------------------------------------------

export interface QuestionnaireAppProps {
  /** Destination for the $99 Sales Funnel Strategy Call booking button */
  salesFunnelBookingUrl?: string;
  /** Destination for the $99 Website Strategy Call booking button */
  websiteBookingUrl?: string;
  /** Destination for "Return to Nexus Luma" on the low-intent screen */
  homeUrl?: string;
  /** Called once the questionnaire has produced a final result */
  onComplete?: (result: QuestionnaireResult) => void;
  /** Called for every analytics event the questionnaire fires */
  onAnalyticsEvent?: (eventName: string, eventData?: Record<string, unknown>) => void;
  /** Overrides the default mock CRM submission function */
  submitLead?: (result: QuestionnaireResult) => Promise<void>;
  /** Which contact fields are required. Defaults to firstName + email only. */
  contactFieldRequirements?: Partial<ContactFieldRequirements>;
  /** Enables the on-screen development panel. Defaults to false. */
  devMode?: boolean;
  /** Disables sessionStorage persistence. Defaults to false (persistence on). */
  disablePersistence?: boolean;
}
