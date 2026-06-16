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

exports.handler = async () => {
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
  if (!publishableKey) {
    return json(500, { error: "STRIPE_PUBLISHABLE_KEY is not configured." });
  }
  return json(200, { publishableKey });
};

