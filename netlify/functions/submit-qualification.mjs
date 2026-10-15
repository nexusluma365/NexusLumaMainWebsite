// Netlify Functions v2 entry point (needed for Blobs strong consistency).
// Logic lives in ./_crm/submit-qualification.js so it can be unit-tested directly.
import mod from "./_crm/submit-qualification.js";
import adapter from "./_crm/v2.js";
import { getStore } from "@netlify/blobs";

// Static ESM import so Netlify bundles Blobs into this function.
globalThis.__nlGetBlobStore = getStore;

export default adapter.toV2(mod.handler);
export const config = { path: "/api/submit-qualification" };
