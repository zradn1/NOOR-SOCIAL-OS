import type { Metadata } from "next";
import { ProfileForm } from "@/features/settings/settings-forms";
import { listTimeZones } from "@/lib/time/timezones";
import { requireWorkspace } from "@/server/auth/context";
import { getProfile } from "@/server/services/profiles";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage({ params }: PageProps<"/w/[workspace]/settings/profile">) {
  const { workspace } = await params;
  const ctx = await requireWorkspace(workspace);
  const profile = await getProfile(ctx.identity);
  return <ProfileForm fullName={profile.fullName} email={profile.email} timezone={profile.timezone} zones={listTimeZones()} />;
}
