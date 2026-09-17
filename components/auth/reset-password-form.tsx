"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { authClient } from "@/lib/auth/client";
import { authErrorMessage } from "./auth-errors";
import { PasswordInput } from "./password-input";

const MIN_LENGTH = 8;

/** The player chooses a new password from the one-time link the admin handed over (spec § 3.20). */
export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = password.length >= MIN_LENGTH && confirm === password && !pending;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setPending(true);
    try {
      const result = await authClient.resetPassword({ newPassword: password, token });
      if (result.error) {
        setError(authErrorMessage(result.error));
        return;
      }
      setDone(true);
    } catch {
      setError("Impossible de joindre le serveur.");
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-5" data-reset-done>
        <Alert tone="success">Ton nouveau mot de passe est enregistré. Tu peux te connecter avec.</Alert>
        <Link
          href="/login"
          className="inline-flex min-h-13 w-full items-center justify-center rounded-2xl bg-sage-500 px-6 text-base font-semibold text-ink-950 hover:bg-sage-400"
        >
          Se connecter
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label="Nouveau mot de passe" htmlFor="new-password" hint={`Au moins ${MIN_LENGTH} caractères.`}>
        <PasswordInput
          id="new-password"
          name="new-password"
          autoComplete="new-password"
          required
          minLength={MIN_LENGTH}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="••••••••"
        />
      </Field>
      <Field label="Confirme-le" htmlFor="confirm-password" error={mismatch ? "Les deux mots de passe ne sont pas identiques." : null}>
        <PasswordInput
          id="confirm-password"
          name="confirm-password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          placeholder="••••••••"
          aria-invalid={mismatch || undefined}
        />
      </Field>
      <Button type="submit" disabled={!canSubmit}>
        {pending ? "Enregistrement…" : "Enregistrer le mot de passe"}
      </Button>
    </form>
  );
}
