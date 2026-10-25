import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";

export default function WorkspaceNotFound() {
  return (
    <div className="mx-auto max-w-xl py-16">
      <EmptyState
        icon={SearchX}
        title="Not found"
        description="This page doesn't exist, or you don't have access to it. Workspaces you can't access look the same as ones that don't exist."
        action={
          <Button asChild variant="secondary" size="sm">
            <a href="/app">Go to my workspace</a>
          </Button>
        }
      />
    </div>
  );
}
