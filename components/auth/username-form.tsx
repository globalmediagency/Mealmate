"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { USERNAME } from "@/lib/game/config";
import { validateUsername } from "@/lib/profile/username";

type UsernameFormProps = { suggestion?: string };

export function UsernameForm({ suggestion = "" }: UsernameFormProps) {
  const router = useRouter();
  const [username, setUsername] = useState(suggestion);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const validation = validateUsername(username);
    if (!validation.ok) {
      setError(validation.message);
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: validation.username }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(body?.error?.message ?? "Impossible d'enregistrer ce pseudo.");
        setPending(false);
        return;
      }
      router.push("/home");
      router.refresh();
    } catch {
      setError("Impossible de joindre le serveur. Vérifie ta connexion.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field
        label="Ton pseudo"
        htmlFor="username"
        hint={`${USERNAME.min} à ${USERNAME.max} caractères, lettres, chiffres et tirets bas.`}
      >
        <Input
          id="username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          required
          maxLength={USERNAME.max}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="ex. Chabond_42"
        />
      </Field>
      <Button type="submit" disabled={pending || !username}>
        {pending ? "Enregistrement…" : "C'est parti"}
      </Button>
    </form>
  );
}
