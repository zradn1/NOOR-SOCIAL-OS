/**
 * Returns a safe in-app path for post-auth redirects. Rejects absolute URLs,
 * protocol-relative URLs ("//evil.com"), backslash tricks, and control
 * characters, which prevents open redirects.
 */
export function safeRedirectPath(value: unknown, fallback = "/app"): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return fallback;
  try {
    const url = new URL(value, "http://n.invalid");
    if (url.origin !== "http://n.invalid") return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
