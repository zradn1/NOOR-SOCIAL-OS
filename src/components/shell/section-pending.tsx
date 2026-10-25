import { Hammer } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";

/** Temporary placeholder for a section that a later build stage implements. */
export function SectionPending({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-8">
      <PageHeader title={title} description={description} />
      <EmptyState icon={Hammer} title="Not built yet" description="This section is implemented in a later stage of the build." />
    </div>
  );
}
