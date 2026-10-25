import { NextResponse, type NextRequest } from "next/server";
import { isPlatform } from "@/lib/platforms/registry";
import { safeRedirectPath } from "@/lib/utils/redirect";
import { getSessionUser } from "@/server/auth/session";
import { requestMeta } from "@/server/security/request";
import { completeAuthorization } from "@/server/services/social-accounts";

/**
 * OAuth redirect target. Validates the single-use state, exchanges the code,
 * and stores encrypted tokens. Never reports success without the provider's
 * verified response.
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/api/integrations/[platform]/callback">) {
  const { platform } = await params;
  const { searchParams } = request.nextUrl;
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/sign-in", request.url));
  if (!isPlatform(platform)) return new NextResponse("Not found", { status: 404 });

  const state = searchParams.get("state") ?? "";
  const code = searchParams.get("code") ?? "";
  const providerError = searchParams.get("error");
  if (providerError || !state || !code) {
    return NextResponse.redirect(new URL(`/app?integration_error=${providerError ? "denied" : "invalid_callback"}`, request.url));
  }

  const outcome = await completeAuthorization(user, { platform, state: state.slice(0, 200), code: code.slice(0, 2000) }, await requestMeta());
  const path = safeRedirectPath(outcome.redirectPath, "/app");
  const query = outcome.ok ? `connected=${platform}` : `integration_error=${outcome.reason}&platform=${platform}`;
  const response = NextResponse.redirect(new URL(`${path}?${query}`, request.url));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
