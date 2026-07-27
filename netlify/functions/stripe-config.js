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
  const publishableKey =
    process.env.STRIPE_PUBLISHABLE_KEY ||
    "pk_live_51TeycBPJOp8s8XsSjWLZD8n3JweuczqhYYgoJKLkiNfogQUnveNxlB3YMOM8GPrBAd8YCWYNXxVv4vKdgcoftxoR00IsTaLRDD";

  if (!publishableKey) {
    return json(500, { error: "STRIPE_PUBLISHABLE_KEY is not configured." });
  }

  return json(200, { publishableKey });
};
