import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export const inputClasses =
  "w-full min-h-13 rounded-2xl border border-ink-500 bg-ink-900/80 px-4 py-3 text-base text-cream-100 placeholder:text-cream-700 transition-colors focus:border-sage-500 focus:outline-none focus:ring-2 focus:ring-sage-500/30 disabled:opacity-50 aria-invalid:border-danger/70";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(inputClasses, className)} {...props} />;
}

type FieldProps = {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
};

export function Field({ label, htmlFor, hint, error, children, className }: FieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-cream-300">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-cream-500">{hint}</p>
      ) : null}
    </div>
  );
}
