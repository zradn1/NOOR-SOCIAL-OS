import { Lock } from "lucide-react";
import { EmptyState } from "@/components/ui/states";
import { PERMISSIONS, ROLE_LABEL, type Permission } from "@/lib/auth/permissions";

export function AccessDenied({ permission, what = "this section" }: { permission: Permission; what?: string }) {
  return (
    <EmptyState
      icon={Lock}
      title="You don't have access"
      description={`Viewing ${what} requires the ${ROLE_LABEL[PERMISSIONS[permission]]} role or higher. Ask an admin of this workspace if you need it.`}
    />
  );
}
