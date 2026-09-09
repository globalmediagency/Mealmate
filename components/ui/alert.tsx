import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

type AlertProps = {
  tone?: "info" | "warning" | "danger" | "success";
  title?: string;
  children: ReactNode;
  className?: string;
};

const TONES = {
  info: "border-mood/30 bg-mood/10 text-cream-100",
  warning: "border-brass-500/40 bg-brass-500/10 text-cream-100",
  danger: "border-danger/40 bg-danger/10 text-cream-100",
  success: "border-health/40 bg-health/10 text-cream-100",
} as const;

export function Alert({ tone = "info", title, children, className }: AlertProps) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("rounded-2xl border px-4 py-3 text-sm leading-relaxed", TONES[tone], className)}
    >
      {title ? <p className="mb-1 font-semibold">{title}</p> : null}
      {children}
    </div>
  );
}
