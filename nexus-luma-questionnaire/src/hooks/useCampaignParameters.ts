import { useMemo } from "react";
import type { CampaignParameters } from "../types/questionnaire";

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "ref"] as const;

/**
 * Reads UTM + referral parameters from the current URL once on mount.
 * Never throws — missing parameters simply come back undefined.
 */
export function useCampaignParameters(): CampaignParameters {
  return useMemo(() => {
    const params: CampaignParameters = {};

    try {
      if (typeof window !== "undefined") {
        const searchParams = new URLSearchParams(window.location.search);
        for (const key of UTM_KEYS) {
          const value = searchParams.get(key);
          if (value) {
            (params as Record<string, string>)[key] = value;
          }
        }
        params.landingPageUrl = window.location.href;
        params.referrer = document.referrer || undefined;
      }
    } catch {
      // If URL parsing fails for any reason, return whatever was gathered so far.
    }

    return params;
  }, []);
}
