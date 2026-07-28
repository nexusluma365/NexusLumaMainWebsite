// ---------------------------------------------------------------------------
// Configurable destination links.
// Override these by passing props to <QuestionnaireApp /> — do not hardcode
// a booking provider deeper into the component tree than this file.
// ---------------------------------------------------------------------------

const ZOOM_STRATEGY_CALL_URL = "https://scheduler.zoom.us/elijah-thornton/30-min-strategy-call";

export const SALES_FUNNEL_BOOKING_URL =
  import.meta.env.VITE_SALES_FUNNEL_BOOKING_URL || ZOOM_STRATEGY_CALL_URL;

export const WEBSITE_BOOKING_URL =
  import.meta.env.VITE_WEBSITE_BOOKING_URL || ZOOM_STRATEGY_CALL_URL;

export const NEXUS_LUMA_HOME_URL =
  import.meta.env.VITE_NEXUS_LUMA_HOME_URL || "/";

export const LEAD_SUBMISSION_ENDPOINT =
  import.meta.env.VITE_LEAD_SUBMISSION_ENDPOINT || "/api/submit-lead";

export const LEAD_SUBMISSION_SECRET =
  import.meta.env.VITE_LEAD_SUBMISSION_SECRET || "";
