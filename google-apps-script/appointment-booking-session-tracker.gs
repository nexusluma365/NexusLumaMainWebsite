/**
 * Nexus Luma appointment booking session tracker.
 *
 * Paste this file into Extensions > Apps Script from inside your Google Sheet.
 * Deploy as a Web App:
 *   Execute as: Me
 *   Who has access: Anyone
 *
 * Then set Netlify environment variable:
 *   GOOGLE_SCRIPT_URL = <your Web App URL>
 *
 * The script writes to the "Appointment Booking" tab shown in your screenshot.
 * Each visitor session is one row. Every step updates a different column.
 */

const SHEET_NAME = 'Appointment Booking';

const HEADERS = [
  'Session ID',
  'First Seen',
  'Last Updated',
  'Current Status',
  'Last Event',
  'Last Step',
  'Page URL',
  'Referrer',
  'User Agent',
  'Email Step At',
  'Email',
  'Website Step At',
  'Website',
  'No Website At',
  'Analysis Started At',
  'Analysis Completed At',
  'Analysis Score',
  'Analysis Error',
  'Plan Started At',
  'Name Step At',
  'Name',
  'Business Step At',
  'Business',
  'Goal Step At',
  'Goal',
  'Budget Step At',
  'Budget',
  'Timeline Step At',
  'Timeline',
  'Checkout Reached At',
  'Payment Started At',
  'Payment Successful At',
  'Payment Intent ID',
  'Pay Later At',
  'Abandoned At',
  'Booking Step Reached At',
  'Booking Date Selected At',
  'Booking Date',
  'Booking Time Selected At',
  'Booking Time',
  'Booked At',
  'Calendar Event ID',
  'Calendar Event Link',
  'Confirmation Shown At',
  'Raw Latest JSON'
];

function doGet() {
  setupAppointmentBookingSheet();
  return jsonResponse_({
    ok: true,
    message: 'Nexus Luma appointment booking tracker is live.',
    sheetName: SHEET_NAME
  });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    const payload = parsePayload_(e);
    const sheet = getTrackingSheet_();
    ensureHeaders_(sheet);

    const row = findOrCreateSessionRow_(sheet, payload);
    updateSessionRow_(sheet, row, payload);

    return jsonResponse_({
      ok: true,
      row,
      sessionId: getSessionId_(payload)
    });
  } catch (error) {
    return jsonResponse_({
      ok: false,
      error: error.message || 'Session could not be recorded.'
    });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Run this once manually from Apps Script to create headers and formatting.
 */
function setupAppointmentBookingSheet() {
  const sheet = getTrackingSheet_();
  ensureHeaders_(sheet);
  formatTrackingSheet_(sheet);
}

/**
 * Manual test. Run after setupAppointmentBookingSheet().
 */
function testAppointmentBookingTracker() {
  return doPost({
    postData: {
      contents: JSON.stringify({
        sessionId: 'test-session-' + Date.now(),
        event: 'booked',
        status: 'booked',
        step: 6,
        pageUrl: 'https://nexusluma.com/',
        referrer: 'https://google.com/',
        userAgent: 'Apps Script test',
        email: 'test@example.com',
        name: 'Test Visitor',
        business: 'Test Business',
        url: 'https://example.com',
        goal: 'Get more calls',
        budget: '$1,000-$2,500',
        timeline: 'This month',
        score: 82,
        paymentIntentId: 'pi_test_123',
        bookingDate: '2026-07-13',
        bookingTime: '10:00 AM',
        eventId: 'calendar-event-test',
        eventLink: 'https://calendar.google.com/'
      })
    }
  });
}

function parsePayload_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error('Missing POST body.');
  }

  try {
    return JSON.parse(e.postData.contents);
  } catch (error) {
    throw new Error('Invalid JSON payload.');
  }
}

function getTrackingSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
  }

  return sheet;
}

function ensureHeaders_(sheet) {
  const currentHeaders = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  const needsHeaders = currentHeaders.every(value => !value) ||
    HEADERS.some((header, index) => currentHeaders[index] !== header);

  if (!needsHeaders) return;

  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  formatTrackingSheet_(sheet);
}

function formatTrackingSheet_(sheet) {
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, HEADERS.length)
    .setFontWeight('bold')
    .setBackground('#0b173d')
    .setFontColor('#ffffff')
    .setWrap(true);

  sheet.getRange(1, 1, Math.max(sheet.getMaxRows(), 2), HEADERS.length).setWrap(true);
  sheet.autoResizeColumns(1, HEADERS.length);

  const widths = {
    1: 220,
    2: 155,
    3: 155,
    4: 150,
    5: 170,
    7: 260,
    8: 220,
    9: 320,
    11: 220,
    13: 260,
    21: 180,
    23: 180,
    25: 220,
    27: 160,
    29: 160,
    33: 190,
    38: 140,
    40: 130,
    43: 260,
    45: 520
  };

  Object.keys(widths).forEach(column => {
    sheet.setColumnWidth(Number(column), widths[column]);
  });
}

function findOrCreateSessionRow_(sheet, payload) {
  const sessionId = getSessionId_(payload);
  if (!sessionId) {
    throw new Error('Missing sessionId.');
  }

  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const sessionValues = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let index = 0; index < sessionValues.length; index += 1) {
      if (String(sessionValues[index][0]) === sessionId) {
        return index + 2;
      }
    }
  }

  const now = new Date();
  const emptyRow = new Array(HEADERS.length).fill('');
  emptyRow[col_('Session ID')] = sessionId;
  emptyRow[col_('First Seen')] = now;
  emptyRow[col_('Last Updated')] = now;
  sheet.appendRow(emptyRow);
  return sheet.getLastRow();
}

function updateSessionRow_(sheet, row, payload) {
  const now = new Date();
  const range = sheet.getRange(row, 1, 1, HEADERS.length);
  const values = range.getValues()[0];
  const eventName = String(payload.event || payload.status || '').trim();
  const status = String(payload.status || eventName || '').trim();

  set_(values, 'Last Updated', now);
  set_(values, 'Current Status', status || value_(values, 'Current Status'));
  set_(values, 'Last Event', eventName);
  set_(values, 'Last Step', payload.step || payload.stepReached || '');
  setIfPresent_(values, 'Page URL', payload.pageUrl);
  setIfPresent_(values, 'Referrer', payload.referrer);
  setIfPresent_(values, 'User Agent', payload.userAgent);

  setIfPresent_(values, 'Email', payload.email);
  setIfPresent_(values, 'Website', payload.url || payload.website);
  setIfPresent_(values, 'Name', payload.name);
  setIfPresent_(values, 'Business', payload.business);
  setIfPresent_(values, 'Goal', payload.goal);
  setIfPresent_(values, 'Budget', payload.budget);
  setIfPresent_(values, 'Timeline', payload.timeline);
  setIfPresent_(values, 'Analysis Score', payload.score || payload.auditScore);
  setIfPresent_(values, 'Analysis Error', payload.analysisError);
  setIfPresent_(values, 'Payment Intent ID', payload.paymentIntentId);
  setIfPresent_(values, 'Booking Date', payload.bookingDate || payload.selectedDate);
  setIfPresent_(values, 'Booking Time', payload.bookingTime || payload.selectedTime);
  setIfPresent_(values, 'Calendar Event ID', payload.eventId);
  setIfPresent_(values, 'Calendar Event Link', payload.eventLink || payload.htmlLink);
  set_(values, 'Raw Latest JSON', JSON.stringify(payload));

  applyEventTimestamp_(values, eventName, now);
  applyLegacyStatusTimestamp_(values, status, now);

  range.setValues([values]);
  colorStatus_(sheet.getRange(row, col_('Current Status') + 1), status);
}

function applyEventTimestamp_(values, eventName, now) {
  const map = {
    email_submitted: 'Email Step At',
    website_submitted: 'Website Step At',
    no_website: 'No Website At',
    analysis_started: 'Analysis Started At',
    analysis_completed: 'Analysis Completed At',
    questionnaire_started: 'Plan Started At',
    name_submitted: 'Name Step At',
    business_submitted: 'Business Step At',
    goal_selected: 'Goal Step At',
    budget_selected: 'Budget Step At',
    timeline_selected: 'Timeline Step At',
    checkout_reached: 'Checkout Reached At',
    reached_checkout: 'Checkout Reached At',
    payment_started: 'Payment Started At',
    purchased: 'Payment Successful At',
    pay_later: 'Pay Later At',
    abandoned: 'Abandoned At',
    booking_reached: 'Booking Step Reached At',
    booking_date_selected: 'Booking Date Selected At',
    booking_time_selected: 'Booking Time Selected At',
    booked: 'Booked At',
    confirmation_shown: 'Confirmation Shown At'
  };

  const header = map[eventName];
  if (header) set_(values, header, now);
}

function applyLegacyStatusTimestamp_(values, status, now) {
  if (status === 'reached_checkout') set_(values, 'Checkout Reached At', now);
  if (status === 'purchased') set_(values, 'Payment Successful At', now);
  if (status === 'pay_later') set_(values, 'Pay Later At', now);
  if (status === 'abandoned') set_(values, 'Abandoned At', now);
  if (status === 'booked') set_(values, 'Booked At', now);
}

function getSessionId_(payload) {
  return String(payload.sessionId || payload.session_id || '').trim();
}

function col_(header) {
  const index = HEADERS.indexOf(header);
  if (index === -1) throw new Error('Unknown header: ' + header);
  return index;
}

function set_(values, header, value) {
  values[col_(header)] = value;
}

function setIfPresent_(values, header, value) {
  if (value === undefined || value === null || value === '') return;
  set_(values, header, value);
}

function value_(values, header) {
  return values[col_(header)];
}

function colorStatus_(cell, status) {
  const colors = {
    funnel_opened: '#e3f2fd',
    email_submitted: '#e8f5e9',
    website_submitted: '#e8f5e9',
    analysis_started: '#fff9c4',
    analysis_completed: '#dcedc8',
    questionnaire_started: '#e1bee7',
    reached_checkout: '#fff9c4',
    checkout_reached: '#fff9c4',
    payment_started: '#ffe0b2',
    purchased: '#c8e6c9',
    pay_later: '#ffe0b2',
    abandoned: '#ffcdd2',
    booking_reached: '#bbdefb',
    booked: '#a5d6a7',
    confirmation_shown: '#a5d6a7'
  };

  cell.setBackground(colors[status] || '#ffffff');
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
