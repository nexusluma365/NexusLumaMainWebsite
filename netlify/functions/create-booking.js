const {
  BOOKING_TIMEZONE,
  buildSlots,
  createCalendarClient,
  getMockBookedSlotSet,
  hasGoogleCalendarConfig,
  isBeforeAvailableFrom,
  isWeekday,
  makeCalendarErrorResponse,
  makeJsonResponse,
  parseDateKey
} = require('./_shared');
const { clean, forwardPipelineRecord } = require('./_lead-system');

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

    if (!isWeekday(selectedDate) || isBeforeAvailableFrom(selectedDate)) {
      return makeJsonResponse(409, { error: 'That date is not available.' });
    }

    // Only real slots inside booking hours (Mon-Fri, 10 AM-4 PM ET), never in the past.
    const isOfferedSlot = buildSlots(selectedDate).some((slot) => slot.start === slotStart && slot.end === slotEnd);
    if (!isOfferedSlot || new Date(slotStart) <= new Date()) {
      return makeJsonResponse(409, { error: 'That time is not available. Please choose another.' });
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

    // Mark the lead as "Call Booked" in the lead sheet. Never fails the booking.
    await forwardPipelineRecord({
      updateEmail: clean(email, 160).toLowerCase(),
      leadId: clean(payload.leadId, 80),
      status: 'CALL_BOOKED',
      callStart: slotStart,
      callEnd: slotEnd,
      eventLink: result.data.htmlLink || ''
    });

    return makeJsonResponse(200, {
      mode: 'google',
      eventId: result.data.id || '',
      htmlLink: result.data.htmlLink || '',
      timeZone: BOOKING_TIMEZONE
    });
  } catch (error) {
    console.error('create-booking failed:', error);
    return makeCalendarErrorResponse(error, 'Unable to create the calendar invite automatically.');
  }
};
