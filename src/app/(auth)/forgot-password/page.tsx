import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeading } from "@/features/auth/auth-heading";
import { ForgotPasswordForm } from "@/features/auth/auth-forms";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-8">
      <AuthHeading
        title="Reset your password"
        description="Enter the email you sign in with and we'll send you a secure link."
      />
      <ForgotPasswordForm />
      <p className="text-center text-[13px] text-fg-muted">
        <Link href="/sign-in" className="text-gold-300 hover:text-gold-200">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
