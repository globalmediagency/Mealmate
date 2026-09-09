"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils/cn";

type CopyButtonProps = { value: string; label: string; className?: string };

export function CopyButton({ value, label, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard may be unavailable (insecure context); ignore.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={label}
      className={cn(
        "inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-ink-500 bg-ink-700 px-3 text-xs font-semibold text-cream-300 transition-colors hover:bg-ink-600",
        copied && "border-health/50 text-health",
        className,
      )}
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copied ? "Copié" : "Copier"}
    </button>
  );
}
