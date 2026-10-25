import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { NoorLogo } from "@/components/brand/logo";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/states";
import { AcceptInvitationButton } from "@/features/settings/accept-invitation";
import { ROLE_LABEL } from "@/lib/auth/permissions";
import { requireUser } from "@/server/auth/session";
import { getInvitationPreview } from "@/server/services/members";

export const metadata: Metadata = { title: "Invitation" };

async function InvitationContent({ params }: Pick<PageProps<"/invite/[token]">, "params">) {
  const { token } = await params;
  const user = await requireUser(`/invite/${token}`);
  const invite = await getInvitationPreview(token);
  if (!invite || invite.status === "invalid") {
    return <Alert tone="warning" title="This invitation is no longer valid">Ask the person who invited you for a new link.</Alert>;
  }
  if (invite.status === "expired") {
    return <Alert tone="warning" title="This invitation has expired">Ask the person who invited you for a new link.</Alert>;
  }
  const emailMatches = user.email === invite.email;
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="font-display text-[2rem] leading-tight text-fg">Join {invite.organizationName}</h1>
        <p className="text-sm text-fg-muted">
          {invite.inviter ? `${invite.inviter} invited you` : "You were invited"} as{" "}
          <Badge tone="gold">{ROLE_LABEL[invite.role]}</Badge>
        </p>
      </div>
      {emailMatches ? (
        <AcceptInvitationButton token={token} />
      ) : (
        <Alert tone="warning" title="Signed in with a different email">
          This invitation was sent to {invite.email}. Sign out and sign in with that address to accept it.
        </Alert>
      )}
    </div>
  );
}

export default function InvitationPage({ params }: PageProps<"/invite/[token]">) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        <Link href="/" className="block w-fit">
          <NoorLogo />
        </Link>
        <Suspense fallback={<Skeleton className="h-48 w-full" />}>
          <InvitationContent params={params} />
        </Suspense>
      </div>
    </main>
  );
}
