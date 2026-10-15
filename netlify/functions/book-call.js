// Steps 5–6 of the funnel: schedule the free Zoom strategy call for a lead
// that already completed the qualification form. The browser sends only the
// signed lead token and the chosen slot; all customer details come from the
// saved lead, so nothing is entered twice.
//
// POST { action: "start", leadToken }                     -> marks BOOKING_STARTED, returns summary
// POST { action: "book", leadToken, date, start, timezone, replaceBookingToken? }
//
// Availability is real: the slot must be on the generated grid, free in
// Google Calendar, and win an atomic slot lock (no double booking).

const shared = require("./_shared");
const { json, parseBody, clean } = require("./_lead-system");
const { db, newId } = require("./_db");
const { sign, verify } = require("./_tokens");
const { SITE_URL, bookingEmails, callBrief, createMeeting, deleteMeeting, sendEmail } = require("./_integrations");
const { cancelBooking } = require("./manage-booking");

const MIN_LEAD_MINUTES = 60;

function validTimeZone(tz) {
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
}

function publicBooking(booking) {
  return {
    bookingId: booking.bookingId,
    start: booking.start,
    end: booking.end,
    timezone: booking.timezone,
    businessTimezone: booking.businessTimezone,
    meetingProvider: booking.meetingProvider,
    zoomJoinUrl: booking.zoomJoinUrl,
    zoomPasscode: booking.zoomPasscode,
    status: booking.status
  };
}

async function waitForBooking(repo, bookingId) {
  for (let i = 0; i < 15; i++) {
    const booking = await repo.getBooking(bookingId);
    if (booking) return booking;
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Use POST." });
  const body = parseBody(event);
  if (!body) return json(400, { error: "Invalid request." });

  const token = verify(body.leadToken, "lead");
  if (!token) return json(401, { error: "Your session expired. Please enter your details again." });

  const repo = db(event);
  const lead = await repo.getLead(token.id);
  if (!lead) return json(404, { error: "We couldn't find your details. Please enter them again." });

  const summary = { firstName: lead.firstName, lastName: lead.lastName, businessName: lead.businessName, email: lead.email, phone: lead.phone };
  const schedulerUrl = shared.getGoogleCalendarBookingUrl();

  if (body.action === "start") {
    await repo.setLeadStatus(lead.leadId, "BOOKING_STARTED");
    const active = await activeBooking(repo, lead);
    return json(200, {
      ok: true,
      summary,
      liveCalendar: shared.hasGoogleCalendarConfig(),
      schedulerUrl,
      activeBooking: active ? { ...publicBooking(active), bookingToken: sign("booking", active.bookingId) } : null
    });
  }

  if (body.action !== "book") return json(400, { error: "Unknown action." });

  // ---- validate the requested slot against real availability -------------
  const dateKey = clean(body.date, 10);
  const start = clean(body.start, 40);
  const timezone = validTimeZone(body.timezone) ? body.timezone : shared.BOOKING_TIMEZONE;
  try { shared.parseDateKey(dateKey); } catch { return json(400, { error: "Choose a date." }); }
  if (!shared.isWeekday(dateKey)) return json(409, { error: "That date isn't available." });
  if (Date.parse(start) < Date.now() + MIN_LEAD_MINUTES * 60 * 1000) return json(409, { error: "That time is too soon. Please choose another." });
  if (!shared.hasGoogleCalendarConfig()) {
    return json(503, { error: "Live scheduling is unavailable right now.", schedulerUrl, retryable: false });
  }

  const slot = shared.buildSlots(dateKey).find((s) => s.start === start);
  if (!slot) return json(409, { error: "That time isn't available. Please choose another." });

  // Replacing (rescheduling) an existing booking for this same lead?
  const replace = verify(body.replaceBookingToken, "booking");
  const replacing = replace ? await repo.getBooking(replace.id) : null;
  const replacingOwn = replacing && replacing.leadId === lead.leadId && replacing.status === "BOOKED" ? replacing : null;

  // Idempotency: a repeated click for the same slot returns the same booking.
  const existing = await activeBooking(repo, lead);
  if (existing && existing.start === slot.start) {
    return json(200, { ok: true, duplicate: true, booking: publicBooking(existing), bookingToken: sign("booking", existing.bookingId) });
  }
  if (existing && (!replacingOwn || existing.bookingId !== replacingOwn.bookingId)) {
    return json(409, { error: "You already have a call booked.", alreadyBooked: true, bookingToken: sign("booking", existing.bookingId) });
  }

  const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";
  let calendar;
  try {
    calendar = shared.createCalendarClient();
    const fb = await calendar.freebusy.query({ requestBody: { timeMin: slot.start, timeMax: slot.end, items: [{ id: calendarId }] } });
    const busy = fb.data.calendars?.[calendarId]?.busy || [];
    if (busy.length) return json(409, { error: "That time was just taken. Please choose another.", taken: true });
  } catch (error) {
    console.error("Availability re-check failed:", error.message);
    return json(503, { error: "Live scheduling is unavailable right now.", schedulerUrl });
  }

  const bookingId = newId("book");
  const lock = await repo.lockSlot(slot.start, bookingId, lead.leadId);
  if (!lock.locked) {
    // Same lead double-clicked: wait for the first request's booking and return it.
    if (lock.holder && lock.holder.leadId === lead.leadId) {
      const first = await waitForBooking(repo, lock.holder.bookingId);
      if (first && first.status === "BOOKED") {
        return json(200, { ok: true, duplicate: true, booking: publicBooking(first), bookingToken: sign("booking", first.bookingId) });
      }
    }
    return json(409, { error: "That time was just taken. Please choose another.", taken: true });
  }

  const businessName = lead.businessName || `${lead.firstName} ${lead.lastName}`;
  const meeting = await createMeeting({ topic: `Nexus Luma Strategy Call — ${businessName}`, startISO: slot.start, minutes: shared.SLOT_MINUTES, timezone: shared.BOOKING_TIMEZONE });
  const bookingToken = sign("booking", bookingId);
  const manageUrl = `${SITE_URL()}/booked/?t=${encodeURIComponent(bookingToken)}`;

  let eventId = "";
  try {
    const created = await calendar.events.insert({
      calendarId,
      sendUpdates: "all",
      requestBody: {
        summary: `Nexus Luma Strategy Call — ${businessName}`,
        location: meeting.joinUrl || "Zoom (link to follow)",
        description: [
          meeting.joinUrl ? `Join Zoom: ${meeting.joinUrl}${meeting.passcode ? ` (passcode ${meeting.passcode})` : ""}` : "Your Zoom link will be sent before the call.",
          `Reschedule or cancel: ${manageUrl}`,
          "",
          "CALL BRIEF",
          ...callBrief(lead)
        ].join("\n"),
        start: { dateTime: slot.start, timeZone: shared.BOOKING_TIMEZONE },
        end: { dateTime: slot.end, timeZone: shared.BOOKING_TIMEZONE },
        attendees: [{ email: lead.email, displayName: `${lead.firstName} ${lead.lastName}`.trim() }],
        reminders: { useDefault: true }
      }
    });
    eventId = created.data.id || "";
  } catch (error) {
    console.error("Calendar event creation failed:", error.message);
    await repo.releaseSlot(slot.start, bookingId);
    await deleteMeeting(meeting.meetingId);
    return json(502, { error: "We couldn't confirm that time. Please try again." });
  }

  const now = new Date().toISOString();
  const booking = await repo.saveBooking({
    bookingId,
    leadId: lead.leadId,
    start: slot.start,
    end: slot.end,
    timezone,
    businessTimezone: shared.BOOKING_TIMEZONE,
    meetingProvider: meeting.provider,
    zoomMeetingId: meeting.meetingId,
    zoomJoinUrl: meeting.joinUrl,
    zoomPasscode: meeting.passcode,
    calendarEventId: eventId,
    status: "BOOKED",
    createdAt: now,
    rescheduledFrom: replacingOwn ? replacingOwn.bookingId : null
  });

  await repo.patchLead(lead.leadId, (l) => {
    l.bookingIds = [...new Set([...(l.bookingIds || []), bookingId])];
    l.activeBookingId = bookingId;
    return l;
  });
  await repo.setLeadStatus(lead.leadId, "CALL_BOOKED", { force: true, note: bookingId });

  if (replacingOwn) await cancelBooking(repo, replacingOwn, { reason: "rescheduled", keepLeadStatus: true });

  const fresh = await repo.getLead(lead.leadId);
  const { customer, internal } = bookingEmails({ lead: fresh, booking, manageUrl });
  const [customerMail] = await Promise.all([sendEmail(customer), internal ? sendEmail(internal) : null]);

  return json(200, {
    ok: true,
    booking: publicBooking(booking),
    bookingToken,
    emailSent: customerMail.sent,
    calendarInviteSent: true
  });
};

async function activeBooking(repo, lead) {
  if (!lead.activeBookingId) return null;
  const booking = await repo.getBooking(lead.activeBookingId);
  return booking && booking.status === "BOOKED" && Date.parse(booking.end) > Date.now() ? booking : null;
}
