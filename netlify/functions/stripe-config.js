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
  "pk_test_51TeycBPJOp8s8XsSvgsYs2KtFZt1F2fUg9W32bxS2rDcORtp4F89PUj54Dz1WJbhPS1i8vnouVLeSiUX9cWfzp4v00RLV2KMcT";

exports.handler = async () => {
  return json(200, { publishableKey: PUBLISHABLE_KEY });
};

