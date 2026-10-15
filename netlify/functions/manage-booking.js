// /booked/ confirmation page backend: booking details, cancel, reschedule.
// GET  ?t=<bookingToken>
// POST { t, action: "cancel" }
// Rescheduling books the new time first (book-call with replaceBookingToken),
// then cancels the old one, so the visitor never ends up with no slot.

const shared = require("./_shared");
const { json, parseBody } = require("./_lead-system");
const { db } = require("./_db");
const { sign, verify } = require("./_tokens");
const { deleteMeeting } = require("./_integrations");

async function cancelBooking(repo, booking, { reason = "cancelled_by_customer", keepLeadStatus = false } = {}) {
  if (booking.status !== "BOOKED") return booking;
  if (booking.calendarEventId && shared.hasGoogleCalendarConfig()) {
    try {
      await shared.createCalendarClient().events.delete({
        calendarId: process.env.GOOGLE_CALENDAR_ID || "primary",
        eventId: booking.calendarEventId,
        sendUpdates: "all"
      });
    } catch (error) {
      console.error("Calendar event delete failed:", error.message);
    }
  }
  await deleteMeeting(booking.zoomMeetingId);
  await repo.releaseSlot(booking.start, booking.bookingId);
  const updated = await repo.patchBooking(booking.bookingId, (b) => {
    if (b.status !== "BOOKED") return null;
    b.status = "CANCELLED";
    b.cancelledAt = new Date().toISOString();
    b.cancelReason = reason;
    return b;
  });
  if (!keepLeadStatus) {
    await repo.patchLead(booking.leadId, (l) => {
      if (l.activeBookingId === booking.bookingId) l.activeBookingId = null;
      return l;
    });
    const lead = await repo.getLead(booking.leadId);
    if (lead && lead.status === "CALL_BOOKED") await repo.setLeadStatus(lead.leadId, "BOOKING_STARTED", { force: true, note: reason });
  }
  return updated;
}

exports.cancelBooking = cancelBooking;

exports.handler = async (event) => {
  const body = event.httpMethod === "POST" ? parseBody(event) : null;
  const tokenValue = event.httpMethod === "GET" ? event.queryStringParameters?.t : body?.t;
  const token = verify(tokenValue, "booking");
  if (!token) return json(401, { error: "This link is invalid or has expired." });

  const repo = db(event);
  const booking = await repo.getBooking(token.id);
  if (!booking) return json(404, { error: "Booking not found." });
  const lead = await repo.getLead(booking.leadId);

  const view = () => ({
    booking: {
      start: booking.start,
      end: booking.end,
      timezone: booking.timezone,
      businessTimezone: booking.businessTimezone,
      status: booking.status,
      meetingProvider: booking.meetingProvider,
      zoomJoinUrl: booking.zoomJoinUrl,
      zoomPasscode: booking.zoomPasscode
    },
    firstName: lead?.firstName || "",
    businessName: lead?.businessName || "",
    // Lets the visitor pick a new time without re-entering details.
    leadToken: lead ? sign("lead", lead.leadId) : ""
  });

  if (event.httpMethod === "GET") return json(200, view());
  if (event.httpMethod !== "POST") return json(405, { error: "Use GET or POST." });

  if (body.action === "cancel") {
    const updated = await cancelBooking(repo, booking);
    Object.assign(booking, updated || {});
    return json(200, { ok: true, ...view() });
  }
  return json(400, { error: "Unknown action." });
};
