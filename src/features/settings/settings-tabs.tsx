"use client";

import { useParams } from "next/navigation";
import { NavTabs } from "@/components/ui/tabs";

export function SettingsTabs({ showOrganization, showAudit }: { showOrganization: boolean; showAudit: boolean }) {
  const { workspace } = useParams<{ workspace: string }>();
  const base = `/w/${workspace}/settings`;
  const items = [
    { href: base, label: "Workspace", exact: true },
    { href: `${base}/members`, label: "Workspace access" },
    ...(showOrganization ? [{ href: `${base}/organization`, label: "Organization" }] : []),
    ...(showAudit ? [{ href: `${base}/audit`, label: "Audit log" }] : []),
    { href: `${base}/profile`, label: "Profile" },
  ];
  return <NavTabs items={items} />;
}
