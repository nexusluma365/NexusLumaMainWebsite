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
  "pk_test_51TeycBPJOp8s8XsSvgsYs2KtFZt1F2fUg9W32bxS2rDcORtp4F89PUj54Dz1WJbhPS1i8vnouVLeSiUX9cWfzp4v00RLV2KMcT";

exports.handler = async () => {
  const publishableKey =
    process.env.STRIPE_PUBLISHABLE_KEY ||
    process.env.VITE_STRIPE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
    process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY ||
    process.env.STRIPE_PUBLIC_KEY ||
    DEFAULT_STRIPE_PUBLISHABLE_KEY;

  if (!publishableKey) {
    return json(500, { error: "Stripe publishable key is not configured." });
  }

  return json(200, {
    publishableKey,
    mode: publishableKey.startsWith("pk_test_") ? "test" : "live"
  });
};
