const { google } = require('googleapis');

const BOOKING_TIMEZONE = process.env.BOOKING_TIMEZONE || 'America/New_York';
const SLOT_START_HOUR = Number(process.env.BOOKING_START_HOUR || 9);
const SLOT_END_HOUR = Number(process.env.BOOKING_END_HOUR || 17);
const SLOT_MINUTES = Number(process.env.BOOKING_SLOT_MINUTES || 30);

function hasGoogleCalendarConfig() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN &&
      process.env.GOOGLE_CALENDAR_ID
  );
}

function createCalendarClient() {
  if (!hasGoogleCalendarConfig()) {
    throw new Error('Google Calendar environment variables are not configured.');
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || ''
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN
  });

  return google.calendar({ version: 'v3', auth: oauth2Client });
}

function parseDateKey(dateKey) {
  const parts = String(dateKey || '').split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    throw new Error('Invalid date key. Expected YYYY-MM-DD.');
  }

  return {
    year: parts[0],
    month: parts[1],
    day: parts[2]
  };
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function getTimePartsInTimeZone(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  return formatter.formatToParts(date).reduce((accumulator, part) => {
    if (part.type !== 'literal') {
      accumulator[part.type] = part.value;
    }
    return accumulator;
  }, {});
}

function zonedTimeToUtc(dateKey, hour, minute, timeZone = BOOKING_TIMEZONE) {
  const { year, month, day } = parseDateKey(dateKey);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const parts = getTimePartsInTimeZone(utcGuess, timeZone);

  const tzAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );

  return new Date(utcGuess.getTime() + (utcGuess.getTime() - tzAsUtc));
}

function formatSlotLabel(date, timeZone = BOOKING_TIMEZONE) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

function isWeekday(dateKey) {
  const { year, month, day } = parseDateKey(dateKey);
  const dayOfWeek = new Date(year, month - 1, day).getDay();
  return dayOfWeek >= 1 && dayOfWeek <= 5;
}

function getMockStore() {
  if (!globalThis.__nexusLumaMockStore) {
    globalThis.__nexusLumaMockStore = {
      bookedSlots: new Map()
    };
  }

  return globalThis.__nexusLumaMockStore;
}

function getMockBookedSlotSet(dateKey) {
  const store = getMockStore();
  if (!store.bookedSlots.has(dateKey)) {
    store.bookedSlots.set(dateKey, new Set());
  }
  return store.bookedSlots.get(dateKey);
}

function overlapsAny(slotStart, slotEnd, busyIntervals) {
  const start = new Date(slotStart);
  const end = new Date(slotEnd);

  return busyIntervals.some((busy) => {
    const busyStart = new Date(busy.start);
    const busyEnd = new Date(busy.end);
    return start < busyEnd && end > busyStart;
  });
}

function buildSlots(dateKey, { busyIntervals = [], bookedSlotSet = new Set() } = {}) {
  const slots = [];

  for (let hour = SLOT_START_HOUR; hour < SLOT_END_HOUR; hour += 1) {
    for (let minute = 0; minute < 60; minute += SLOT_MINUTES) {
      if (hour === SLOT_END_HOUR - 1 && minute > 60 - SLOT_MINUTES) {
        continue;
      }

      const start = zonedTimeToUtc(dateKey, hour, minute, BOOKING_TIMEZONE);
      const end = new Date(start.getTime() + SLOT_MINUTES * 60 * 1000);
      const slotStart = start.toISOString();

      if (bookedSlotSet.has(slotStart)) {
        continue;
      }

      if (busyIntervals.length && overlapsAny(slotStart, end.toISOString(), busyIntervals)) {
        continue;
      }

      slots.push({
        start: slotStart,
        end: end.toISOString(),
        label: formatSlotLabel(start, BOOKING_TIMEZONE),
        startLabel: formatSlotLabel(start, BOOKING_TIMEZONE)
      });
    }
  }

  return slots;
}

function makeJsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
    },
    body: JSON.stringify(payload)
  };
}

function makeTextResponse(statusCode, body, contentType = 'text/plain; charset=utf-8') {
  return {
    statusCode,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'no-store'
    },
    body
  };
}

module.exports = {
  BOOKING_TIMEZONE,
  SLOT_START_HOUR,
  SLOT_END_HOUR,
  SLOT_MINUTES,
  buildSlots,
  createCalendarClient,
  formatSlotLabel,
  getMockBookedSlotSet,
  hasGoogleCalendarConfig,
  isWeekday,
  makeJsonResponse,
  makeTextResponse,
  parseDateKey,
  zonedTimeToUtc
};