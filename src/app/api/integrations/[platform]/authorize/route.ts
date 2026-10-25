import { NextResponse, type NextRequest } from "next/server";
import { isPlatform } from "@/lib/platforms/registry";
import { getWorkspaceContext } from "@/server/auth/context";
import { toAppError } from "@/server/errors";
import { isSameOrigin } from "@/server/security/origin";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { startAuthorization } from "@/server/services/social-accounts";

/** Starts the official OAuth flow for a platform (form POST from the accounts page). */
export async function POST(request: NextRequest, { params }: RouteContext<"/api/integrations/[platform]/authorize">) {
  const { platform } = await params;
  const form = await request.formData();
  const slug = String(form.get("workspace") ?? "");
  const back = (query: string) => NextResponse.redirect(new URL(`/w/${slug}/accounts?${query}`, request.url), 303);

  if (!isSameOrigin(request)) return new NextResponse("Forbidden", { status: 403 });
  if (!isPlatform(platform)) return new NextResponse("Not found", { status: 404 });
  const ctx = await getWorkspaceContext(slug);
  if (!ctx) return NextResponse.redirect(new URL("/sign-in", request.url), 303);

  try {
    await enforceRateLimit("oauthStart", ctx.user.id);
    const url = await startAuthorization(ctx, platform);
    return NextResponse.redirect(url, 303);
  } catch (error) {
    const appError = toAppError(error);
    return back(`integration_error=${encodeURIComponent(appError.code.toLowerCase())}&platform=${platform}`);
  }
}
