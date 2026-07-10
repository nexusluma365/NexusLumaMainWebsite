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

// Env var takes priority; publishable key is designed to be client-visible
const PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY ||
  "pk_live_51TeycBPJOp8s8XsSjWLZD8n3JweuczqhYYgoJKLkiNfogQUnveNxlB3YMOM8GPrBAd8YCWYNXxVv4vKdgcoftxoR00IsTaLRDD";

exports.handler = async () => {
  return json(200, { publishableKey: PUBLISHABLE_KEY });
};
