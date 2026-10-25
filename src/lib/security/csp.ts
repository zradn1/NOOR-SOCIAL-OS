/**
 * Content Security Policy for every page.
 *
 * The app uses Partial Prerendering, which can't carry per-request nonces, so
 * scripts allow 'unsafe-inline' (Next.js streams its payload in inline
 * scripts). Everything else is locked down: no third-party scripts, no
 * plugins, no framing, no form posts or connections to other origins except
 * the Supabase project used for direct media uploads.
 */
export function buildContentSecurityPolicy(options: { supabaseUrl?: string | null; isDev: boolean; upgradeInsecure: boolean }) {
  let supabaseOrigin = "";
  try {
    if (options.supabaseUrl) supabaseOrigin = new URL(options.supabaseUrl).origin;
  } catch {
    supabaseOrigin = "";
  }
  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", "'unsafe-inline'", ...(options.isDev ? ["'unsafe-eval'"] : [])]],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    // Media attached by URL can live on any HTTPS host; images can't run code.
    ["img-src", ["'self'", "data:", "blob:", "https:"]],
    ["media-src", ["'self'", "blob:", "https:"]],
    ["font-src", ["'self'"]],
    ["connect-src", ["'self'", ...(supabaseOrigin ? [supabaseOrigin] : [])]],
    ["worker-src", ["'self'", "blob:"]],
    ["manifest-src", ["'self'"]],
    ["frame-src", ["'none'"]],
    ["frame-ancestors", ["'none'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
  ];
  const policy = directives.map(([name, values]) => `${name} ${values.join(" ")}`);
  if (options.upgradeInsecure) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}
