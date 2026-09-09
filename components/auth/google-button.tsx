"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { signIn } from "@/lib/auth/client";
import { authErrorMessage } from "./auth-errors";

type GoogleButtonProps = { next?: string; onError?: (message: string) => void };

export function GoogleButton({ next = "/home", onError }: GoogleButtonProps) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    const { error } = await signIn.social({
      provider: "google",
      callbackURL: next,
      newUserCallbackURL: "/onboarding",
      errorCallbackURL: "/login?error=google",
    });
    if (error) {
      setPending(false);
      onError?.(authErrorMessage(error));
    }
  }

  return (
    <Button variant="secondary" onClick={handleClick} disabled={pending}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.9 1.5l2.6-2.6C16.9 3.1 14.7 2 12 2 6.5 2 2 6.5 2 12s4.5 10 10 10c5.8 0 9.6-4.1 9.6-9.8 0-.7-.1-1.2-.2-1.7H12z" />
      </svg>
      {pending ? "Redirection…" : "Continuer avec Google"}
    </Button>
  );
}
