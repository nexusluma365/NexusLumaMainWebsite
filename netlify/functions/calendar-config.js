const { getGoogleCalendarBookingUrl } = require('./_shared');

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
  return json(200, { bookingUrl: getGoogleCalendarBookingUrl() });
};
