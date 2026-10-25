import { Suspense } from "react";
import { ShellSkeleton, WorkspaceShell } from "@/components/shell/workspace-shell";

async function Shell({ params, children }: LayoutProps<"/w/[workspace]">) {
  const { workspace } = await params;
  return <WorkspaceShell slug={workspace}>{children}</WorkspaceShell>;
}

export default function WorkspaceLayout(props: LayoutProps<"/w/[workspace]">) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <Shell {...props} />
    </Suspense>
  );
}
