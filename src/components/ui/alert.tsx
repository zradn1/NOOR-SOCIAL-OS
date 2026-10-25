import { cva, type VariantProps } from "class-variance-authority";
import { AlertTriangle, CheckCircle2, FlaskConical, Info, OctagonAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

const alertVariants = cva("relative flex gap-3 rounded-md border px-4 py-3 text-[13px] leading-relaxed", {
  variants: {
    tone: {
      info: "border-info/25 bg-info-wash [&>svg]:text-info",
      success: "border-success/25 bg-success-wash [&>svg]:text-success",
      warning: "border-warning/25 bg-warning-wash [&>svg]:text-warning",
      danger: "border-danger/25 bg-danger-wash [&>svg]:text-danger",
      demo: "border-demo-line bg-demo-wash demo-hatch [&>svg]:text-demo",
      neutral: "border-line-strong bg-surface-raised [&>svg]:text-fg-muted",
    },
  },
  defaultVariants: { tone: "info" },
});

const icons = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: OctagonAlert,
  demo: FlaskConical,
  neutral: Info,
};

export function Alert({
  tone = "info",
  title,
  children,
  action,
  className,
}: VariantProps<typeof alertVariants> & {
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const Icon = icons[tone ?? "info"];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn(alertVariants({ tone }), className)}>
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1 space-y-0.5">
        {title ? <p className="font-medium text-fg">{title}</p> : null}
        {children ? <div className="text-fg-secondary">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0 self-center">{action}</div> : null}
    </div>
  );
}
