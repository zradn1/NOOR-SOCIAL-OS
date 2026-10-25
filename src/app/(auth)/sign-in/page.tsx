import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/states";
import { AuthHeading } from "@/features/auth/auth-heading";
import { SignInForm } from "@/features/auth/auth-forms";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  "link-expired": "That link is invalid or has expired. Request a new one.",
  "not-configured": "Authentication isn't configured for this deployment yet.",
  suspended: "This account is suspended. Contact Noor Studio support if you think this is a mistake.",
};

async function SignInContent({ searchParams }: Pick<PageProps<"/sign-in">, "searchParams">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const error = typeof params.error === "string" ? ERRORS[params.error] : undefined;
  return (
    <>
      {error ? <Alert tone="warning">{error}</Alert> : null}
      <SignInForm next={next} />
    </>
  );
}

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <div className="space-y-8">
      <AuthHeading title="Welcome back" description="Sign in to your NOOR workspace." />
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <SignInContent searchParams={searchParams} />
      </Suspense>
      <p className="text-center text-[13px] text-fg-muted">
        New to NOOR?{" "}
        <Link href="/sign-up" className="text-gold-300 hover:text-gold-200">
          Create an account
        </Link>
      </p>
    </div>
  );
}
