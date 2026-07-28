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

const DEFAULT_STRIPE_PUBLISHABLE_KEY =
  "pk_live_51TeycBPJOp8s8XsSjWLZD8n3JweuczqhYYgoJKLkiNfogQUnveNxlB3YMOM8GPrBAd8YCWYNXxVv4vKdgcoftxoR00IsTaLRDD";

exports.handler = async () => {
  const configuredKeys = [
    process.env.STRIPE_PUBLISHABLE_KEY,
    process.env.VITE_STRIPE_PUBLISHABLE_KEY,
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY,
    process.env.STRIPE_PUBLIC_KEY
  ].filter(Boolean);

  const publishableKey =
    configuredKeys.find((key) => key.startsWith("pk_live_")) ||
    DEFAULT_STRIPE_PUBLISHABLE_KEY;

  if (!publishableKey) {
    return json(500, { error: "Stripe publishable key is not configured." });
  }

  return json(200, {
    publishableKey,
    mode: publishableKey.startsWith("pk_test_") ? "test" : "live"
  });
};
