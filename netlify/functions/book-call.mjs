// Netlify Functions v2 entry point (needed for Blobs strong consistency).
// Logic lives in ./_crm/book-call.js so it can be unit-tested directly.
import mod from "./_crm/book-call.js";
import adapter from "./_crm/v2.js";
import { getStore } from "@netlify/blobs";

// Static ESM import so Netlify bundles Blobs into this function.
globalThis.__nlGetBlobStore = getStore;

// Same for Google Calendar (googleapis is otherwise a runtime require).
import { google } from "googleapis";
globalThis.__nlGoogleApis = google;

export default adapter.toV2(mod.handler);
export const config = { path: "/api/book-call" };
