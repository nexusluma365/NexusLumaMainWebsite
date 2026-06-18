const CATEGORY_NAMES = [
  "Visual Design",
  "Page Speed",
  "SEO Foundations",
  "Conversion & CTAs",
  "Mobile Experience",
  "Trust Signals"
];
const DEFAULT_ANTHROPIC_MODEL = "claude-haiku-4-5";
const WEBSITE_FETCH_TIMEOUT_MS = 2500;
const CLAUDE_TIMEOUT_MS = 5500;

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store"
    },
    body: JSON.stringify(body)
  };
}

function normalizeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) throw new Error("Website URL is required.");
  const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname.includes(".")) {
    throw new Error("Please enter a valid website URL.");
  }
  return url.toString();
}

function clampScore(value, fallback = 50) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(100, Math.round(num)));
}

const MAJOR_WEBSITE_PROFILES = [
  { key: "amazon", label: "Amazon" },
  { key: "apple", label: "Apple" },
  { key: "google", label: "Google" },
  { key: "youtube", label: "YouTube" },
  { key: "microsoft", label: "Microsoft" },
  { key: "netflix", label: "Netflix" },
  { key: "nike", label: "Nike" },
  { key: "walmart", label: "Walmart" },
  { key: "target", label: "Target" },
  { key: "tesla", label: "Tesla" },
  { key: "meta", label: "Meta" },
  { key: "facebook", label: "Facebook" },
  { key: "instagram", label: "Instagram" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "airbnb", label: "Airbnb" },
  { key: "stripe", label: "Stripe" },
  { key: "shopify", label: "Shopify" }
];

function hostnameFromUrl(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function majorWebsiteProfile(value) {
  const host = hostnameFromUrl(value);
  if (!host) return null;
  return MAJOR_WEBSITE_PROFILES.find((profile) => {
    const key = `${profile.key}.`;
    return host === profile.key || host.startsWith(key) || host.includes(`.${key}`);
  }) || null;
}

function stableScoreFromHost(value) {
  const host = hostnameFromUrl(value);
  const seed = host.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return 92 + (seed % 5);
}

function averageBusinessScore(value) {
  const score = clampScore(value, 73);
  return Math.max(70, Math.min(81, 70 + Math.round((score / 100) * 11)));
}

function finalizeResult(result, analyzedUrl) {
  const profile = majorWebsiteProfile(analyzedUrl);
  const nextResult = { ...result };

  if (profile) {
    const majorScore = stableScoreFromHost(analyzedUrl);
    nextResult.overall_score = majorScore;
    nextResult.categories = (nextResult.categories || []).map((category, index) => ({
      ...category,
      score: Math.max(88, Math.min(96, majorScore - 3 + (index % 5)))
    }));
    nextResult.is_major_website = true;
    nextResult.major_website_name = profile.label;
    nextResult.score_explanation = `${profile.label} converts well because the page is fast to understand, easy to trust, and clear about what visitors should do next. Big brands win attention by using simple messaging, strong proof, clean layouts, and obvious action paths.`;
    nextResult.opportunity_text = `High-converting websites usually score 83 and above because they make buying feel simple. The Website Lead Conversion Plan shows how to bring that same clarity, trust, and action path into your own website.`;
    nextResult.benchmark_note = nextResult.opportunity_text;
    nextResult.summary = `${profile.label} is a high-converting benchmark website. It works because it makes trust, clarity, speed, and the next step feel simple for the visitor.`;
    return nextResult;
  }

  nextResult.overall_score = averageBusinessScore(nextResult.overall_score);
  nextResult.categories = (nextResult.categories || []).map((category) => ({
    ...category,
    score: averageBusinessScore(category.score)
  }));
  nextResult.is_major_website = false;
  nextResult.opportunity_text = opportunityText(nextResult.categories || [], analyzedUrl);
  nextResult.benchmark_note = nextResult.opportunity_text;
  return nextResult;
}

function stripScripts(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
}

function extractAttr(html, selectorRegex) {
  const match = html.match(selectorRegex);
  return match ? match[1].replace(/\s+/g, " ").trim() : "";
}

function extractHeadings(html) {
  const headings = [];
  const regex = /<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  let match;
  while ((match = regex.exec(html)) && headings.length < 12) {
    const text = match[2].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (text) headings.push(`H${match[1]}: ${text}`);
  }
  return headings;
}

function extractVisibleText(html) {
  return stripScripts(html)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4200);
}

function collectSignals(html, finalUrl, elapsedMs) {
  const title = extractAttr(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description = extractAttr(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i)
    || extractAttr(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["'][^>]*>/i);
  const h1Count = (html.match(/<h1\b/gi) || []).length;
  const imgCount = (html.match(/<img\b/gi) || []).length;
  const imgAltCount = (html.match(/<img\b[^>]+alt=["'][^"']+["'][^>]*>/gi) || []).length;
  const formCount = (html.match(/<form\b/gi) || []).length;
  const buttonCount = (html.match(/<button\b|role=["']button["']/gi) || []).length;
  const phoneLinks = (html.match(/href=["']tel:/gi) || []).length;
  const mailLinks = (html.match(/href=["']mailto:/gi) || []).length;
  const viewportMeta = /<meta[^>]+name=["']viewport["']/i.test(html);
  const headings = extractHeadings(html);
  const visibleText = extractVisibleText(html);
  const proofSignals = (visibleText.match(/\b(review|reviews|testimonial|testimonials|case study|portfolio|guarantee|licensed|insured|certified|award|trusted)\b/gi) || []).length;
  const localSignals = (visibleText.match(/\b(local|near me|service area|serving|city|county|neighborhood)\b/gi) || []).length;
  const https = finalUrl.startsWith("https://");

  return {
    finalUrl,
    fetchedInMs: elapsedMs,
    htmlBytes: Buffer.byteLength(html, "utf8"),
    title,
    description,
    h1Count,
    imgCount,
    imgAltCount,
    formCount,
    buttonCount,
    phoneLinks,
    mailLinks,
    viewportMeta,
    proofSignals,
    localSignals,
    https,
    headings,
    visibleText
  };
}

function buildPrompt(url, lead, signals) {
  return `You are a senior website strategist for local service businesses, premium brands, and lead-generation websites.

Analyze this real website evidence and return only valid compact JSON. Be specific to the page evidence. Do not invent metrics you cannot infer. Keep every note concise.

Submitted URL: ${url}
Lead name: ${[lead.firstName, lead.lastName].filter(Boolean).join(" ") || "not provided"}
Lead email: ${lead.email || "not provided"}

Website evidence:
${JSON.stringify(signals, null, 2)}

Return exactly this JSON shape:
{
  "overall_score": 0,
  "summary": "1-2 concise sentences about the current site and biggest opportunity.",
  "categories": [
    { "name": "Visual Design", "score": 0, "note": "short specific observation" },
    { "name": "Page Speed", "score": 0, "note": "short specific observation" },
    { "name": "SEO Foundations", "score": 0, "note": "short specific observation" },
    { "name": "Conversion & CTAs", "score": 0, "note": "short specific observation" },
    { "name": "Mobile Experience", "score": 0, "note": "short specific observation" },
    { "name": "Trust Signals", "score": 0, "note": "short specific observation" }
  ],
  "recommendations": [
    "<strong>Key action</strong> - practical recommendation based on evidence.",
    "<strong>Key action</strong> - practical recommendation based on evidence.",
    "<strong>Key action</strong> - practical recommendation based on evidence.",
    "<strong>Key action</strong> - practical recommendation based on evidence.",
    "<strong>Key action</strong> - practical recommendation based on evidence."
  ],
  "audit_sections": {
    "strengths": ["specific thing the site is doing well", "specific thing the site is doing well"],
    "conversion_opportunities": ["lead-costing opportunity", "lead-costing opportunity"],
    "design_user_experience": "short practical assessment",
    "messaging_offer_clarity": "short practical assessment",
    "trust_credibility": "short practical assessment",
    "cta_effectiveness": "short practical assessment",
    "mobile_experience": "short practical assessment",
    "seo_visibility": "short practical assessment",
    "priority_improvements": ["highest priority improvement", "second priority improvement", "third priority improvement"],
    "quick_wins": ["quick win", "quick win", "quick win"],
    "recommended_next_steps": ["recommended next step", "recommended next step"]
  }
}`;
}

function parseClaudeJson(payload) {
  const text = (payload.content || [])
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Claude did not return JSON.");
  return JSON.parse(match[0]);
}

function timeoutSignal(ms) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

function claudeModel() {
  return process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL;
}

function pageSentence(signals) {
  const text = String(signals.visibleText || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";

  const sentence = text
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .find((item) => item.length >= 45 && item.length <= 180);

  const chosen = (sentence || text.slice(0, 110)).replace(/^["']|["']$/g, "");
  return chosen.length > 120 ? `${chosen.slice(0, 117).trim()}...` : chosen;
}

function scoreExplanation(categories, signals) {
  const weakest = categories.reduce((weak, item) => !weak || item.score < weak.score ? item : weak, null);
  const excerpt = pageSentence(signals);
  const issue = weakest ? weakest.name.toLowerCase() : "clarity";
  const quoted = excerpt ? `, and wording like "${excerpt}" may make the offer harder to understand fast` : "";
  const messages = {
    "visual design": `Your website has a solid foundation, but it may not build trust fast enough for a new visitor${quoted}. When the first impression feels unclear, potential customers often leave before calling, booking, or requesting a quote.`,
    "page speed": "Your website has a solid foundation, but the page may feel slow for people who are ready to take action. When visitors have to wait, they often leave before calling, booking, or requesting a quote.",
    "seo foundations": "Your website has a solid foundation, but people may not quickly see what service you offer or why it matters. When the page does not make that clear, visitors can leave without becoming leads or customers.",
    "conversion & ctas": `Your website has a solid foundation, but the next step may not be obvious enough${quoted}. When visitors are unsure what to do next, they often leave without calling, booking, or requesting a quote.`,
    "mobile experience": "Your website has a solid foundation, but phone visitors may have to work too hard to take action. When calling, booking, or requesting a quote feels difficult, leads can slip away.",
    "trust signals": "Your website has a solid foundation, but it needs stronger proof that your business is the right choice. Without clear reviews, examples, or trust signals, visitors may leave instead of calling, booking, or requesting a quote."
  };

  return messages[issue] || `Your website has a solid foundation, but visitors may not immediately understand why they should choose your business${quoted}. When the offer and next step are not clear, potential customers often leave without calling, booking, or requesting a quote.`;
}

function opportunityText(categories, analyzedUrl = "") {
  const weakest = categories.reduce((weak, item) => !weak || item.score < weak.score ? item : weak, null);
  const issue = weakest ? weakest.name.toLowerCase() : "conversion";
  const focus = {
    "visual design": "trust and first impression",
    "page speed": "speed and visitor patience",
    "seo foundations": "clear service messaging",
    "conversion & ctas": "calls, bookings, and quote requests",
    "mobile experience": "phone visitor flow",
    "trust signals": "reviews, proof, and confidence"
  }[issue] || "trust, clarity, and the next step";
  const siteName = hostnameFromUrl(analyzedUrl).replace(/\.(com|net|org|co|io)$/i, "") || "your website";
  return `A few targeted improvements around ${focus} could help ${siteName} turn more of its existing traffic into leads and customers. High-converting websites usually score 83 and above, and the Website Lead Conversion Plan shows exactly what to improve first.`;
}

function scoreFromParts(parts, fallback = 50) {
  const validParts = parts.filter((part) => part && Number(part.weight) > 0);
  if (!validParts.length) return clampScore(fallback, fallback);
  const totalWeight = validParts.reduce((sum, part) => sum + Number(part.weight), 0);
  const total = validParts.reduce((sum, part) => {
    const score = clampScore(part.score, fallback);
    return sum + score * Number(part.weight);
  }, 0);
  return clampScore(Math.round(total / totalWeight), fallback);
}

function ratioScore(value, good, excellent) {
  const num = Number(value) || 0;
  if (num <= 0) return 0;
  if (num >= excellent) return 100;
  if (num >= good) return 75 + Math.round((num - good) / Math.max(1, excellent - good) * 25);
  return Math.round(num / good * 75);
}

function inverseScore(value, excellent, poor) {
  const num = Number(value) || 0;
  if (num <= excellent) return 100;
  if (num >= poor) return 20;
  return clampScore(Math.round(100 - ((num - excellent) / Math.max(1, poor - excellent)) * 80), 50);
}

function emptySignals(url, reason) {
  return {
    finalUrl: url,
    fetchedInMs: 0,
    htmlBytes: 0,
    title: "",
    description: "",
    h1Count: 0,
    imgCount: 0,
    imgAltCount: 0,
    formCount: 0,
    buttonCount: 0,
    phoneLinks: 0,
    mailLinks: 0,
    viewportMeta: false,
    proofSignals: 0,
    localSignals: 0,
    https: url.startsWith("https://"),
    headings: [],
    visibleText: "",
    fetchIssue: reason || ""
  };
}

function buildSignalAudit(signals, reason = "") {
  const hasTitle = Boolean(signals.title && signals.title.length >= 10);
  const titleLengthScore = signals.title ? inverseScore(Math.abs(signals.title.length - 58), 12, 44) : 0;
  const hasDescription = Boolean(signals.description && signals.description.length >= 40);
  const descriptionLengthScore = signals.description ? inverseScore(Math.abs(signals.description.length - 150), 35, 100) : 0;
  const hasOneH1 = signals.h1Count === 1;
  const altCoverage = signals.imgCount > 0 ? signals.imgAltCount / signals.imgCount : 0;
  const altScore = signals.imgCount === 0 ? 45 : clampScore(altCoverage * 100, 45);
  const hasContactPath = signals.formCount > 0 || signals.phoneLinks > 0 || signals.mailLinks > 0;
  const hasCTA = signals.buttonCount >= 2 || hasContactPath;
  const hasProof = signals.proofSignals >= 2;
  const hasVisibleContent = Boolean(signals.visibleText && signals.visibleText.length >= 700);
  const hasHeadings = signals.headings.length >= 2;
  const visibleContentScore = ratioScore(signals.visibleText.length, 650, 1800);
  const headingScore = ratioScore(signals.headings.length, 2, 6);
  const imageScore = ratioScore(signals.imgCount, 1, 5);
  const speedScore = signals.fetchedInMs ? inverseScore(signals.fetchedInMs, 900, 4500) : 45;
  const sizeScore = signals.htmlBytes ? inverseScore(signals.htmlBytes, 80000, 260000) : 45;
  const contactScore = scoreFromParts([
    { score: hasContactPath ? 80 : 20, weight: 3 },
    { score: ratioScore(signals.buttonCount, 1, 4), weight: 2 },
    { score: signals.formCount > 0 ? 90 : 35, weight: 2 },
    { score: signals.phoneLinks > 0 || signals.mailLinks > 0 ? 80 : 30, weight: 1 }
  ], 45);
  const proofScore = scoreFromParts([
    { score: ratioScore(signals.proofSignals, 2, 7), weight: 3 },
    { score: signals.https ? 85 : 35, weight: 1 },
    { score: altScore, weight: 1 },
    { score: visibleContentScore, weight: 1 }
  ], 45);

  const categories = [
    {
      name: "Visual Design",
      score: scoreFromParts([
        { score: imageScore, weight: 3 },
        { score: headingScore, weight: 2 },
        { score: visibleContentScore, weight: 2 },
        { score: titleLengthScore, weight: 1 }
      ], 58),
      note: signals.imgCount > 0
        ? "The page includes visual assets and headings that can support a professional first impression."
        : "The page needs stronger visual proof and more scannable structure to create confidence quickly."
    },
    {
      name: "Page Speed",
      score: scoreFromParts([
        { score: speedScore, weight: 3 },
        { score: sizeScore, weight: 2 },
        { score: signals.htmlBytes > 0 ? 80 : 35, weight: 1 }
      ], 55),
      note: signals.fetchedInMs
        ? `The HTML responded in about ${signals.fetchedInMs}ms; asset weight and scripts should still be kept lean.`
        : "The analyzer could not time the page response, so speed should be checked directly after the page is reachable."
    },
    {
      name: "SEO Foundations",
      score: scoreFromParts([
        { score: hasTitle ? titleLengthScore : 0, weight: 2 },
        { score: hasDescription ? descriptionLengthScore : 0, weight: 2 },
        { score: hasOneH1 ? 90 : signals.h1Count > 0 ? 55 : 0, weight: 2 },
        { score: altScore, weight: 1 },
        { score: signals.https ? 90 : 30, weight: 1 },
        { score: ratioScore(signals.localSignals, 1, 5), weight: 1 }
      ], 52),
      note: hasDescription && hasOneH1
        ? "Core metadata and heading structure are present, which gives the page a usable SEO foundation."
        : "The page should strengthen title, meta description, H1 structure, image alt text, and local/service relevance."
    },
    {
      name: "Conversion & CTAs",
      score: contactScore,
      note: hasContactPath
        ? "There is a visible contact path; the next opportunity is reducing decision friction and repeating CTAs at natural commitment points."
        : "The page needs a clearer contact path with visible calls, quote requests, booking, or form actions."
    },
    {
      name: "Mobile Experience",
      score: scoreFromParts([
        { score: signals.viewportMeta ? 90 : 20, weight: 3 },
        { score: visibleContentScore, weight: 2 },
        { score: contactScore, weight: 2 },
        { score: sizeScore, weight: 1 }
      ], 54),
      note: signals.viewportMeta
        ? "The page includes a viewport tag; mobile readability and CTA spacing should still be tested on real devices."
        : "The page is missing a clear viewport signal, which can hurt mobile layout and readability."
    },
    {
      name: "Trust Signals",
      score: proofScore,
      note: hasProof
        ? "Trust language appears on the page; it should be placed near CTAs where visitors are weighing risk and confidence."
        : "Add reviews, testimonials, portfolio proof, guarantees, certifications, or other credibility signals."
    }
  ];

  const overall = clampScore(Math.round(categories.reduce((sum, item) => sum + item.score, 0) / categories.length), 50);
  const fetchNote = signals.fetchIssue ? ` The analyzer could not fully fetch the submitted page: ${signals.fetchIssue}.` : "";
  const sourceNote = reason && !signals.fetchIssue ? " This report was generated from live page structure signals." : fetchNote;

  return {
    overall_score: overall,
    summary: `The page has a ${overall >= 70 ? "solid" : "workable"} foundation, but the biggest opportunity is making trust, offer clarity, and the next action easier to understand quickly.${sourceNote}`,
    score_explanation: scoreExplanation(categories, signals),
    opportunity_text: opportunityText(categories, signals.finalUrl),
    page_excerpt: pageSentence(signals),
    categories,
    recommendations: [
      "<strong>Clarify the offer</strong> - reduce cognitive load by making the first screen explain who you help, what you offer, and why it matters.",
      "<strong>Strengthen trust proof</strong> - lower perceived risk by placing reviews, examples, guarantees, or credentials near the main CTA.",
      "<strong>Improve the action path</strong> - guide motivated visitors with clear phone, quote, booking, or contact actions at natural decision points.",
      "<strong>Tighten SEO foundations</strong> - help searchers and visitors confirm relevance with clear titles, one focused H1, service terms, and local context.",
      "<strong>Check mobile flow</strong> - make the page easy to scan and tap so interested visitors can act without friction."
    ],
    audit_sections: {
      strengths: [
        hasTitle ? "The page has a readable title foundation." : "The submitted page can be shaped into a clearer conversion path.",
        hasVisibleContent ? "The page has enough content for visitors and search engines to understand the business." : "The page has room to add clearer service and proof content."
      ],
      conversion_opportunities: [
        "Make the primary CTA specific and visible before visitors lose momentum.",
        "Place trust proof near the sections where visitors are deciding whether to call, book, or request a quote."
      ],
      design_user_experience: "Use a clean visual hierarchy that reduces decision effort: short sections, clear headings, proof, and repeated contact paths.",
      messaging_offer_clarity: "The messaging should quickly answer the visitor's core questions: who this is for, what changes, why it is credible, and what to do next.",
      trust_credibility: "Add or elevate reviews, testimonials, project examples, guarantees, credentials, and clear business details to reduce perceived risk.",
      cta_effectiveness: "Every major section should make the next step obvious at the moment interest is highest, without pressuring or overwhelming the visitor.",
      mobile_experience: "Mobile visitors need readable copy, fast-loading visuals, tap-friendly buttons, and a direct contact path with minimal friction.",
      seo_visibility: "Build stronger SEO foundations with focused metadata, heading structure, service terms, local relevance, and image alt text.",
      priority_improvements: [
        "Clarify the above-the-fold value proposition.",
        "Add confidence-building proof near the first and final CTAs.",
        "Make the contact, quote, or booking path easier to find."
      ],
      quick_wins: [
        "Use one specific primary CTA across the page.",
        "Add review or portfolio proof near the top.",
        "Tighten headings so each section explains a clear benefit."
      ],
      recommended_next_steps: [
        "Turn the audit findings into a focused website improvement plan.",
        "Prioritize changes that increase trust and lead submissions first."
      ]
    },
    analysis_source: reason ? "page-signals-fallback" : "page-signals"
  };
}

function normalizeResult(result, signals = {}) {
  const categories = CATEGORY_NAMES.map((name, index) => {
    const source = (result.categories || []).find((item) => item && item.name === name) || (result.categories || [])[index] || {};
    return {
      name,
      score: clampScore(source.score, 50),
      note: String(source.note || "This area needs a clearer review.").slice(0, 220)
    };
  });
  const categoryAverage = Math.round(categories.reduce((sum, c) => sum + c.score, 0) / categories.length);

  const sectionSource = result.audit_sections || {};
  const listOf = (name, fallback) => {
    const value = sectionSource[name];
    return (Array.isArray(value) && value.length ? value : fallback)
      .slice(0, 5)
      .map((item) => String(item).slice(0, 260));
  };
  const textOf = (name, fallback) => String(sectionSource[name] || fallback).slice(0, 360);

  return {
    overall_score: categoryAverage,
    summary: String(result.summary || "Your website was reviewed for design, SEO, trust, mobile experience, and conversion opportunities.").slice(0, 420),
    score_explanation: scoreExplanation(categories, signals),
    opportunity_text: opportunityText(categories, signals.finalUrl),
    page_excerpt: pageSentence(signals),
    categories,
    recommendations: (Array.isArray(result.recommendations) ? result.recommendations : [])
      .slice(0, 5)
      .map((item) => String(item).slice(0, 300)),
    audit_sections: {
      strengths: listOf("strengths", ["The page has enough visible content to begin shaping a clearer conversion path."]),
      conversion_opportunities: listOf("conversion_opportunities", ["Clarify the primary action visitors should take before they leave the page."]),
      design_user_experience: textOf("design_user_experience", "The design should make the offer easy to understand and the next step obvious."),
      messaging_offer_clarity: textOf("messaging_offer_clarity", "The offer should explain who the business helps, what it provides, and why it is the best choice."),
      trust_credibility: textOf("trust_credibility", "Trust signals should be placed where visitors are deciding whether to contact the business."),
      cta_effectiveness: textOf("cta_effectiveness", "Calls-to-action should be direct, repeated, and tied to the visitor's intent."),
      mobile_experience: textOf("mobile_experience", "Mobile visitors need fast clarity, readable sections, and low-friction contact paths."),
      seo_visibility: textOf("seo_visibility", "SEO visibility depends on clear headings, metadata, local relevance, and focused service content."),
      priority_improvements: listOf("priority_improvements", ["Strengthen the headline and primary CTA.", "Add stronger proof near the top of the page.", "Make the contact path easier to find."]),
      quick_wins: listOf("quick_wins", ["Make the main CTA more specific.", "Add visible trust proof.", "Tighten the first screen message."]),
      recommended_next_steps: listOf("recommended_next_steps", ["Start with the changes most likely to increase calls and quote requests.", "Turn the audit findings into a focused improvement plan."])
    }
  };
}

async function sendLeadWebhook(lead, result, analyzedUrl) {
  if (!process.env.LEAD_WEBHOOK_URL) return { ok: false, status: "not_configured" };
  try {
    const response = await fetch(process.env.LEAD_WEBHOOK_URL, {
      method: "POST",
      redirect: "follow",
      signal: timeoutSignal(12000),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: "website-audit",
        createdAt: new Date().toISOString(),
        lead,
        analyzedUrl,
        result
      })
    });

    let payload = null;
    const contentType = response.headers.get("content-type") || "";
    try {
      payload = await response.clone().json();
    } catch {
      payload = null;
    }

    return {
      ok: response.ok && (!payload || payload.ok !== false),
      status: response.status,
      message: payload?.message || payload?.error || (!contentType.includes("json") ? `Webhook returned ${contentType || "a non-JSON response"}.` : "")
    };
  } catch (error) {
    // Lead webhook failure should not block the visitor's report.
    return { ok: false, status: "failed", message: error.message || "Lead webhook failed." };
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Use POST to analyze a website." });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid JSON request body." });
  }

  let url;
  try {
    url = normalizeUrl(body.url);
  } catch (error) {
    return json(400, { error: error.message });
  }

  try {
    const lead = {
      firstName: String(body.firstName || "").trim(),
      lastName: String(body.lastName || "").trim(),
      email: String(body.email || "").trim(),
      url
    };
    const startedAt = Date.now();
    let signals;
    let fetchIssue = "";

    try {
      const siteResponse = await fetch(url, {
        redirect: "follow",
        signal: timeoutSignal(WEBSITE_FETCH_TIMEOUT_MS),
        headers: {
          "user-agent": "NexusLumaWebsiteAnalyzer/1.0 (+https://nexusluma.com)"
        }
      });

      if (!siteResponse.ok) {
        fetchIssue = `The website returned HTTP ${siteResponse.status}.`;
        signals = emptySignals(url, fetchIssue);
      } else {
        const contentType = siteResponse.headers.get("content-type") || "";
        if (!contentType.includes("text/html")) {
          fetchIssue = "The submitted URL did not return an HTML page.";
          signals = emptySignals(siteResponse.url || url, fetchIssue);
        } else {
          const html = (await siteResponse.text()).slice(0, 90000);
          signals = collectSignals(html, siteResponse.url || url, Date.now() - startedAt);
        }
      }
    } catch (error) {
      fetchIssue = error.name === "TimeoutError" || error.name === "AbortError"
        ? "The website took too long to respond."
        : error.message || "The website could not be fetched.";
      signals = emptySignals(url, fetchIssue);
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      const result = finalizeResult(buildSignalAudit(signals, "ANTHROPIC_API_KEY is not configured."), signals.finalUrl);
      const leadWebhook = await sendLeadWebhook(lead, result, signals.finalUrl);
      return json(200, { result, analyzed_url: signals.finalUrl, analyzer_mode: "fallback", lead_recorded: leadWebhook.ok, lead_webhook_status: leadWebhook.status, lead_webhook_message: leadWebhook.message });
    }

    const prompt = buildPrompt(url, lead, signals);

    try {
      const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: timeoutSignal(CLAUDE_TIMEOUT_MS),
        headers: {
          "content-type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: claudeModel(),
          max_tokens: 1100,
          temperature: 0.2,
          messages: [{ role: "user", content: prompt }]
        })
      });

      if (!claudeResponse.ok) {
        const errorText = await claudeResponse.text();
        const result = finalizeResult(buildSignalAudit(signals, `Claude request failed: ${errorText.slice(0, 180)}`), signals.finalUrl);
        const leadWebhook = await sendLeadWebhook(lead, result, signals.finalUrl);
        return json(200, { result, analyzed_url: signals.finalUrl, analyzer_mode: "fallback", model: claudeModel(), lead_recorded: leadWebhook.ok, lead_webhook_status: leadWebhook.status, lead_webhook_message: leadWebhook.message });
      }

      const claudePayload = await claudeResponse.json();
      const result = finalizeResult(normalizeResult(parseClaudeJson(claudePayload), signals), signals.finalUrl);
      result.analysis_source = "claude";
      const leadWebhook = await sendLeadWebhook(lead, result, signals.finalUrl);
      return json(200, { result, analyzed_url: signals.finalUrl, analyzer_mode: "claude", lead_recorded: leadWebhook.ok, lead_webhook_status: leadWebhook.status, lead_webhook_message: leadWebhook.message });
    } catch (error) {
      const reason = error.name === "TimeoutError" || error.name === "AbortError"
        ? "Claude took too long to respond."
        : error.message || "Claude analysis was unavailable.";
      const result = finalizeResult(buildSignalAudit(signals, reason), signals.finalUrl);
      const leadWebhook = await sendLeadWebhook(lead, result, signals.finalUrl);
      return json(200, { result, analyzed_url: signals.finalUrl, analyzer_mode: "fallback", model: claudeModel(), lead_recorded: leadWebhook.ok, lead_webhook_status: leadWebhook.status, lead_webhook_message: leadWebhook.message });
    }
  } catch (error) {
    return json(500, { error: "The analyzer could not complete the scan.", details: error.message });
  }
};
