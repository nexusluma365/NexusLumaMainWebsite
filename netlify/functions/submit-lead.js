// Env var takes priority; GScript URL is public by design so the fallback is safe
const SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL ||
  "https://script.google.com/macros/s/AKfycby5aDm2UxjtWBOYZTRPEqtgYaFWxOtBd1aMjYY-tLZTmNAsYVewmd5pjc29-iV-UgA/exec";

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
