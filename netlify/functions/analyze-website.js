const CATEGORY_NAMES = [
  "Visual Design",
  "Page Speed",
  "SEO Foundations",
  "Conversion & CTAs",
  "Mobile Experience",
  "Trust Signals"
];

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
  while ((match = regex.exec(html)) && headings.length < 18) {
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
    .slice(0, 9000);
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
  const https = finalUrl.startsWith("https://");
  const headings = extractHeadings(html);
  const visibleText = extractVisibleText(html);

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
    https,
    headings,
    visibleText
  };
}

function buildPrompt(url, lead, signals) {
  return `You are a senior website strategist for local service businesses, premium brands, and lead-generation websites.

Analyze this real website evidence and return only valid JSON. Be specific to the page evidence. Do not invent metrics you cannot infer.

Submitted URL: ${url}
Lead name: ${[lead.firstName, lead.lastName].filter(Boolean).join(" ") || "not provided"}
Lead email: ${lead.email || "not provided"}

Website evidence:
${JSON.stringify(signals, null, 2)}

Return exactly this JSON shape:
{
  "overall_score": 0,
  "summary": "2 concise sentences about the current site and biggest opportunity.",
  "categories": [
    { "name": "Visual Design", "score": 0, "note": "specific observation" },
    { "name": "Page Speed", "score": 0, "note": "specific observation" },
    { "name": "SEO Foundations", "score": 0, "note": "specific observation" },
    { "name": "Conversion & CTAs", "score": 0, "note": "specific observation" },
    { "name": "Mobile Experience", "score": 0, "note": "specific observation" },
    { "name": "Trust Signals", "score": 0, "note": "specific observation" }
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

function normalizeResult(result) {
  const categories = CATEGORY_NAMES.map((name, index) => {
    const source = (result.categories || []).find((item) => item && item.name === name) || (result.categories || [])[index] || {};
    return {
      name,
      score: clampScore(source.score, 50),
      note: String(source.note || "This area needs a clearer review.").slice(0, 220)
    };
  });

  const sectionSource = result.audit_sections || {};
  const listOf = (name, fallback) => {
    const value = sectionSource[name];
    return (Array.isArray(value) && value.length ? value : fallback)
      .slice(0, 5)
      .map((item) => String(item).slice(0, 260));
  };
  const textOf = (name, fallback) => String(sectionSource[name] || fallback).slice(0, 360);

  return {
    overall_score: clampScore(result.overall_score, Math.round(categories.reduce((sum, c) => sum + c.score, 0) / categories.length)),
    summary: String(result.summary || "Your website was reviewed for design, SEO, trust, mobile experience, and conversion opportunities.").slice(0, 420),
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
  if (!process.env.LEAD_WEBHOOK_URL) return;
  try {
    await fetch(process.env.LEAD_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: "website-audit",
        createdAt: new Date().toISOString(),
        lead,
        analyzedUrl,
        result
      })
    });
  } catch {
    // Lead webhook failure should not block the visitor's report.
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Use POST to analyze a website." });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return json(500, { error: "ANTHROPIC_API_KEY is not configured on the server." });
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
    const startedAt = Date.now();
    const siteResponse = await fetch(url, {
      redirect: "follow",
      headers: {
        "user-agent": "NexusLumaWebsiteAnalyzer/1.0 (+https://nexusluma.com)"
      }
    });

    if (!siteResponse.ok) {
      return json(422, { error: `The website returned HTTP ${siteResponse.status}. Please check the URL and try again.` });
    }

    const contentType = siteResponse.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) {
      return json(422, { error: "The submitted URL did not return an HTML page." });
    }

    const html = (await siteResponse.text()).slice(0, 180000);
    const signals = collectSignals(html, siteResponse.url || url, Date.now() - startedAt);
    const lead = {
      firstName: String(body.firstName || "").trim(),
      lastName: String(body.lastName || "").trim(),
      email: String(body.email || "").trim(),
      url
    };
    const prompt = buildPrompt(url, lead, signals);

    const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-latest",
        max_tokens: 1600,
        temperature: 0.2,
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text();
      return json(502, { error: "Claude analyzer request failed.", details: errorText.slice(0, 240) });
    }

    const claudePayload = await claudeResponse.json();
    const result = normalizeResult(parseClaudeJson(claudePayload));
    await sendLeadWebhook(lead, result, signals.finalUrl);
    return json(200, { result, analyzed_url: signals.finalUrl });
  } catch (error) {
    return json(500, { error: "The analyzer could not complete the scan.", details: error.message });
  }
};
