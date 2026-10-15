/* Nexus Luma — tiny provider-agnostic tracking layer.
 * nlTrack(event, data) pushes to window.dataLayer (GTM/GA4), calls gtag if
 * present, and dispatches a "nl:track" DOM event. Add GTM/GA4 to the page and
 * these events flow through automatically.
 *
 * Elements with data-track="event_name" fire that event on click.
 * nlCampaign() returns first-touch UTM/gclid data captured on landing.
 */
(function () {
  "use strict";

  var CAMPAIGN_KEY = "nl_campaign_v1";

  // Google Ads conversions: tracked event -> "AW-18213168150/<conversion label>".
  // The label comes from Google Ads → Goals → Conversions → (your conversion
  // action) → Tag setup → "Use Google tag" → event snippet ("send_to").
  // Empty = that event is not reported as a conversion.
  var ADS_CONVERSIONS = {
    strategy_call_booked: ""
  };
  var PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid"];

  function safeStorage(fn) {
    try { return fn(window.sessionStorage); } catch (e) { return null; }
  }

  function captureCampaign() {
    var existing = safeStorage(function (s) { return JSON.parse(s.getItem(CAMPAIGN_KEY) || "null"); });
    var search = new URLSearchParams(window.location.search);
    var hasParams = PARAMS.some(function (p) { return search.get(p); });
    if (existing && !hasParams) return existing;
    var data = { landingPage: window.location.href.split("#")[0], referrer: document.referrer || "" };
    PARAMS.forEach(function (p) { if (search.get(p)) data[p] = search.get(p).slice(0, 200); });
    safeStorage(function (s) { s.setItem(CAMPAIGN_KEY, JSON.stringify(data)); });
    return data;
  }

  var campaign = captureCampaign();

  window.nlCampaign = function () { return campaign || {}; };

  window.nlTrack = function (eventName, data) {
    var payload = Object.assign({ page_path: window.location.pathname }, data || {});
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(Object.assign({ event: eventName }, payload));
      if (typeof window.gtag === "function") {
        window.gtag("event", eventName, payload);
        if (ADS_CONVERSIONS[eventName]) {
          // transaction_id lets Google Ads count each booking once, even on a reload
          window.gtag("event", "conversion", { send_to: ADS_CONVERSIONS[eventName], transaction_id: payload.transaction_id || "" });
        }
      }
      document.dispatchEvent(new CustomEvent("nl:track", { detail: { event: eventName, data: payload } }));
    } catch (e) { /* tracking must never break the page */ }
    if (/localhost|127\.0\.0\.1/.test(window.location.hostname)) {
      console.info("[nlTrack]", eventName, payload);
    }
  };

  document.addEventListener("click", function (e) {
    var el = e.target.closest && e.target.closest("[data-track]");
    if (!el) return;
    window.nlTrack(el.getAttribute("data-track"), { cta_location: el.getAttribute("data-track-location") || "" });
  });
})();
