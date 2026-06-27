const {
  BOOKING_TIMEZONE,
  buildSlots,
  createCalendarClient,
  getMockBookedSlotSet,
  hasGoogleCalendarConfig,
  isWeekday,
  makeJsonResponse,
  parseDateKey,
  zonedTimeToUtc
} = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
      },
      body: ''
    };
  }

  const dateKey = event.queryStringParameters && event.queryStringParameters.date;

  if (!dateKey) {
    return makeJsonResponse(400, { error: 'Missing required query parameter: date.' });
  }

  try {
    parseDateKey(dateKey);

    if (!isWeekday(dateKey)) {
      return makeJsonResponse(200, {
        date: dateKey,
        timeZone: BOOKING_TIMEZONE,
        mode: hasGoogleCalendarConfig() ? 'google' : 'mock',
        availableSlots: []
      });
    }

    if (!hasGoogleCalendarConfig()) {
      return makeJsonResponse(200, {
        date: dateKey,
        timeZone: BOOKING_TIMEZONE,
        mode: 'mock',
        availableSlots: buildSlots(dateKey, {
          bookedSlotSet: getMockBookedSlotSet(dateKey)
        })
      });
    }

    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
    const calendar = createCalendarClient();
    const dayStart = zonedTimeToUtc(dateKey, 0, 0, BOOKING_TIMEZONE);
    const dayEnd = zonedTimeToUtc(dateKey, 23, 59, BOOKING_TIMEZONE);

    const freeBusy = await calendar.freebusy.query({
      requestBody: {
        timeMin: dayStart.toISOString(),
        timeMax: dayEnd.toISOString(),
        items: [{ id: calendarId }]
      }
    });

    const busyIntervals =
      (freeBusy.data.calendars && freeBusy.data.calendars[calendarId] && freeBusy.data.calendars[calendarId].busy) || [];

    return makeJsonResponse(200, {
      date: dateKey,
      timeZone: BOOKING_TIMEZONE,
      mode: 'google',
      availableSlots: buildSlots(dateKey, { busyIntervals })
    });
  } catch (error) {
    console.error('check-availability failed:', error);
    return makeJsonResponse(500, {
      error: error && error.message ? error.message : 'Unable to load availability.'
    });
  }
};