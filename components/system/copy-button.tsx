"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Copies `text` to the clipboard; the label flips to a confirmation for a moment. */
export function CopyButton({ text, label = "Copier", copiedLabel = "Copié !" }: { text: string; label?: string; copiedLabel?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (insecure context): the text stays selectable below.
    }
  }
  return (
    <Button variant="brass" onClick={copy} className="w-auto px-4">
      {copied ? <Check className="h-5 w-5" aria-hidden="true" /> : <Copy className="h-5 w-5" aria-hidden="true" />}
      {copied ? copiedLabel : label}
    </Button>
  );
}
