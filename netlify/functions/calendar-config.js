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

const BOOKING_URL = process.env.GOOGLE_CALENDAR_BOOKING_URL ||
  "https://calendar.app.google/nrmfrLcW2mooUNUz6";

exports.handler = async () => {
  return json(200, { bookingUrl: BOOKING_URL });
};
