// Netlify Functions v2 entry point (needed for Blobs strong consistency).
// Logic lives in ./_crm/manage-booking.js so it can be unit-tested directly.
import mod from "./_crm/manage-booking.js";
import adapter from "./_crm/v2.js";

export default adapter.toV2(mod.handler);
export const config = { path: "/api/manage-booking" };
