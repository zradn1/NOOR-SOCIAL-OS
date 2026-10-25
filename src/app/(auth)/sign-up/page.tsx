import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeading } from "@/features/auth/auth-heading";
import { SignUpForm } from "@/features/auth/auth-forms";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <div className="space-y-8">
      <AuthHeading title="Create your account" description="Start with a free workspace. No card required." />
      <SignUpForm />
      <p className="text-center text-[13px] text-fg-muted">
        Already have an account?{" "}
        <Link href="/sign-in" className="text-gold-300 hover:text-gold-200">
          Sign in
        </Link>
      </p>
    </div>
  );
}
