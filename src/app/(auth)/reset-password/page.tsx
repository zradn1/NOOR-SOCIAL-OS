import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/states";
import { AuthHeading } from "@/features/auth/auth-heading";
import { ResetPasswordForm } from "@/features/auth/auth-forms";
import { getSessionUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Choose a new password" };

async function ResetContent() {
  // The recovery link signs the user in; without a session the link expired.
  const user = await getSessionUser();
  if (!user) {
    return (
      <Alert tone="warning" title="This reset link has expired">
        <Link href="/forgot-password" className="text-gold-300 underline-offset-4 hover:underline">
          Request a new link
        </Link>
      </Alert>
    );
  }
  return <ResetPasswordForm />;
}

export default function ResetPasswordPage() {
  return (
    <div className="space-y-8">
      <AuthHeading title="Choose a new password" />
      <Suspense fallback={<Skeleton className="h-48 w-full" />}>
        <ResetContent />
      </Suspense>
    </div>
  );
}
