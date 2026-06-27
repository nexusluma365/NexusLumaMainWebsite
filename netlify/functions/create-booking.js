const {
  BOOKING_TIMEZONE,
  createCalendarClient,
  getMockBookedSlotSet,
  hasGoogleCalendarConfig,
  isWeekday,
  makeJsonResponse,
  parseDateKey
} = require('./_shared');

function safeParseBody(event) {
  if (!event.body) {
    return {};
  }

  try {
    return JSON.parse(event.body);
  } catch (error) {
    return {};
  }
}

function buildDescription(payload) {
  const answers = payload.answers || {};

  return [
    `Email: ${payload.email || ''}`,
    `First name: ${payload.fname || ''}`,
    `Last name: ${payload.lname || ''}`,
    `Business: ${payload.biz || ''}`,
    '',
    'Quiz responses:',
    `Website: ${answers.q1 || ''}`,
    `Goal: ${answers.q2 || ''}`,
    `Industry: ${answers.q3 || ''}`,
    `Frustration: ${answers.q4 || ''}`,
    `Clients per month: ${answers.q5 || ''}`,
    `Timeline: ${answers.q6 || ''}`,
    `Budget: ${answers.q7 || ''}`
  ].join('\n');
}

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

  if (event.httpMethod !== 'POST') {
    return makeJsonResponse(405, { error: 'Method not allowed. Use POST.' });
  }

  const payload = safeParseBody(event);
  const { email, fname, lname, biz, selectedDate, slotStart, slotEnd } = payload;

  if (!selectedDate || !slotStart || !slotEnd) {
    return makeJsonResponse(400, { error: 'Missing booking fields.' });
  }

  try {
    parseDateKey(selectedDate);

    if (!isWeekday(selectedDate)) {
      return makeJsonResponse(409, { error: 'That date is not available.' });
    }

    if (!hasGoogleCalendarConfig()) {
      const bookedSlotSet = getMockBookedSlotSet(selectedDate);
      if (bookedSlotSet.has(slotStart)) {
        return makeJsonResponse(409, { error: 'That slot is no longer available.' });
      }

      bookedSlotSet.add(slotStart);

      return makeJsonResponse(200, {
        mode: 'mock',
        eventId: `mock-${selectedDate}-${slotStart}`,
        htmlLink: '',
        timeZone: BOOKING_TIMEZONE
      });
    }

    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
    const calendar = createCalendarClient();

    const conflict = await calendar.freebusy.query({
      requestBody: {
        timeMin: slotStart,
        timeMax: slotEnd,
        items: [{ id: calendarId }]
      }
    });

    const busyIntervals =
      (conflict.data.calendars && conflict.data.calendars[calendarId] && conflict.data.calendars[calendarId].busy) || [];

    if (busyIntervals.length) {
      return makeJsonResponse(409, { error: 'That slot is no longer available.' });
    }

    const result = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: `Strategy Call - ${fname || 'New'} ${lname || 'Lead'}`.trim(),
        description: buildDescription(payload),
        start: {
          dateTime: slotStart,
          timeZone: BOOKING_TIMEZONE
        },
        end: {
          dateTime: slotEnd,
          timeZone: BOOKING_TIMEZONE
        },
        attendees: email ? [{ email }] : undefined,
        reminders: {
          useDefault: true
        }
      },
      sendUpdates: 'all'
    });

    return makeJsonResponse(200, {
      mode: 'google',
      eventId: result.data.id || '',
      htmlLink: result.data.htmlLink || '',
      timeZone: BOOKING_TIMEZONE
    });
  } catch (error) {
    console.error('create-booking failed:', error);
    return makeJsonResponse(500, {
      error: error && error.message ? error.message : 'Unable to create booking.'
    });
  }
};