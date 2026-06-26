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
  return json(200, {
    bookingUrl: process.env.GOOGLE_CALENDAR_BOOKING_URL || ""
  });
};
