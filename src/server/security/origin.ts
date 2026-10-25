import "server-only";
import { env } from "@/server/env";

/**
 * CSRF defence for state-changing Route Handlers (Server Actions already
 * check the Origin header). Accepts only requests whose Origin matches the
 * app, or browsers reporting a same-origin fetch.
 */
export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) return origin === new URL(env().NEXT_PUBLIC_APP_URL).origin;
  return request.headers.get("sec-fetch-site") === "same-origin";
}
