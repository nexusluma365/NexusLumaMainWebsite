// Runs a Lambda-style handler ({ httpMethod, headers, body, queryStringParameters })
// as a Netlify Functions v2 handler. v2 is required for Netlify Blobs strong
// consistency (atomic slot locks, read-after-write on leads and payments).

function toV2(handler) {
  return async (req) => {
    const url = new URL(req.url);
    const headers = {};
    req.headers.forEach((value, key) => { headers[key] = value; });
    const body = ["GET", "HEAD"].includes(req.method) ? "" : await req.text();
    const result = await handler({
      httpMethod: req.method,
      headers,
      body,
      isBase64Encoded: false,
      queryStringParameters: Object.fromEntries(url.searchParams),
      __v2: true
    });
    return new Response(result.body ?? "", { status: result.statusCode, headers: result.headers || {} });
  };
}

module.exports = { toV2 };
