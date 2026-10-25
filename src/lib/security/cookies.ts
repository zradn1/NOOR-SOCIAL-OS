/**
 * Options for the Supabase session cookies. The browser never reads the
 * session (all auth runs on the server), so the cookies are HttpOnly: an
 * injected script can't steal the tokens. Secure whenever the app is served
 * over HTTPS.
 */
export function authCookieOptions(appUrl: string | undefined) {
  return {
    path: "/",
    sameSite: "lax" as const,
    httpOnly: true,
    secure: Boolean(appUrl?.startsWith("https://")),
  };
}
