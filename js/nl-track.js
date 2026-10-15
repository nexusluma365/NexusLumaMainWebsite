/* Nexus Luma — tiny provider-agnostic tracking + attribution layer.
 *
 * nlTrack(event, data) pushes to window.dataLayer (GTM/GA4), calls gtag if
 * present, and dispatches a "nl:track" DOM event. Elements with
 * data-track="event_name" fire that event on click.
 *
 * Attribution: first-touch UTM/GCLID data is kept for 90 days in localStorage
 * (later ad clicks fill gaps and update lastGclid), so a visitor who clicks
 * an ad today and books next week is still attributed to the original
 * campaign/keyword. nlAttribution() returns it; /book/ sends it with the lead.
 */
(function () {
  "use strict";

  var KEY = "nl_attribution_v2";
  var TTL_MS = 90 * 24 * 60 * 60 * 1000;
  var PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "gbraid", "wbraid"];

  function storage(fn) {
    try { return fn(window.localStorage); } catch (e) { return null; }
  }

  function captureAttribution() {
    var saved = storage(function (s) { return JSON.parse(s.getItem(KEY) || "null"); });
    if (saved && saved.firstSeenAt && Date.now() - Date.parse(saved.firstSeenAt) > TTL_MS) saved = null;
    var search = new URLSearchParams(window.location.search);
    var incoming = {};
    PARAMS.forEach(function (p) { if (search.get(p)) incoming[p] = search.get(p).slice(0, 200); });

    var data = saved || {
      firstSeenAt: new Date().toISOString(),
      landingPage: window.location.href.split("#")[0].slice(0, 300),
      referrer: (document.referrer || "").slice(0, 300)
    };
    Object.keys(incoming).forEach(function (k) {
      if (!data[k]) data[k] = incoming[k];
    });
    if (incoming.gclid) data.lastGclid = incoming.gclid;
    storage(function (s) { s.setItem(KEY, JSON.stringify(data)); });
    return data;
  }

  var attribution = captureAttribution();
  window.nlAttribution = function () { return attribution || {}; };
  window.nlCampaign = window.nlAttribution; // backwards compatible name

  window.nlTrack = function (eventName, data) {
    var payload = Object.assign({ page_path: window.location.pathname }, data || {});
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(Object.assign({ event: eventName }, payload));
      if (typeof window.gtag === "function") window.gtag("event", eventName, payload);
      document.dispatchEvent(new CustomEvent("nl:track", { detail: { event: eventName, data: payload } }));
    } catch (e) { /* tracking must never break the page */ }
    if (/localhost|127\.0\.0\.1/.test(window.location.hostname)) console.info("[nlTrack]", eventName, payload);
  };

  document.addEventListener("click", function (e) {
    var el = e.target.closest && e.target.closest("[data-track]");
    if (!el) return;
    window.nlTrack(el.getAttribute("data-track"), { cta_location: el.getAttribute("data-track-location") || "" });
  });
})();
