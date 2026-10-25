"use client";

import { useParams } from "next/navigation";
import { NavTabs } from "@/components/ui/tabs";

export function SettingsTabs({ showOrganization }: { showOrganization: boolean }) {
  const { workspace } = useParams<{ workspace: string }>();
  const base = `/w/${workspace}/settings`;
  const items = [
    { href: base, label: "Workspace", exact: true },
    { href: `${base}/members`, label: "Workspace access" },
    ...(showOrganization ? [{ href: `${base}/organization`, label: "Organization" }] : []),
    { href: `${base}/profile`, label: "Profile" },
  ];
  return <NavTabs items={items} />;
}
