import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

export type ButtonVariant = "primary" | "brass" | "secondary" | "ghost" | "danger";
export type ButtonSize = "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-sage-500 text-ink-950 hover:bg-sage-400",
  brass: "bg-brass-500 text-ink-950 hover:bg-brass-400",
  secondary:
    "border border-ink-500 bg-ink-700 text-cream-100 hover:border-ink-400 hover:bg-ink-600",
  ghost: "bg-transparent text-cream-300 hover:bg-ink-700 hover:text-cream-100",
  danger: "border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20",
};

const SIZES: Record<ButtonSize, string> = {
  md: "min-h-11 px-4 text-sm",
  lg: "min-h-13 px-6 text-base",
};

export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "lg",
  className?: string,
): string {
  return cn(
    "inline-flex w-full items-center justify-center gap-2 rounded-2xl font-semibold tracking-tight transition-[background-color,transform,opacity] duration-150 select-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-400/70",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({
  variant = "primary",
  size = "lg",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses(variant, size, className)}
      {...props}
    />
  );
}

type LinkButtonProps = ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function LinkButton({
  variant = "primary",
  size = "lg",
  className,
  ...props
}: LinkButtonProps) {
  return <Link className={buttonClasses(variant, size, className)} {...props} />;
}
