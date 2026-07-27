/**
 * Reads the Stripe publishable key from whichever env convention is
 * available, without crashing on bundlers that don't support
 * `import.meta.env` (e.g. some Next.js / Create React App / webpack
 * configs). Accessing `import.meta.env.SOMETHING` directly when
 * `import.meta.env` itself is undefined throws a TypeError at module-load
 * time, which crashes the entire component tree — this function guards
 * against that.
 *
 * Precedence: explicit prop > VITE_*.
 */
export function readStripePublishableKey(explicitKey?: string): string | undefined {
  if (explicitKey) return explicitKey;

  // Vite and other bundlers that support import.meta.env
  try {
    // @ts-ignore — import.meta is not typed the same across bundlers
    const metaEnv = typeof import.meta !== "undefined" ? import.meta.env : undefined;
    if (metaEnv && typeof metaEnv === "object") {
      const key = (metaEnv as Record<string, string | undefined>)
        .VITE_STRIPE_PUBLISHABLE_KEY;
      if (key) return key;
    }
  } catch {
    // import.meta not supported by this bundler — fall through.
  }

  return undefined;
}
