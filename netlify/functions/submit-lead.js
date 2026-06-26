const SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  if (!SCRIPT_URL) {
    // Silently succeed if not configured — never block the user flow
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, note: "GOOGLE_SCRIPT_URL not set" }) };
  }

  try {
    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: event.body,
      redirect: "follow"
    });
    const text = await response.text();
    let result;
    try { result = JSON.parse(text); } catch { result = { raw: text }; }
    return { statusCode: 200, headers, body: JSON.stringify(result) };
  } catch (err) {
    // Still return 200 — tracking must never break the checkout
    return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
