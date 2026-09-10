"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { signIn } from "@/lib/auth/client";
import { authErrorMessage } from "./auth-errors";
import { GoogleButton } from "./google-button";
import { PasswordInput } from "./password-input";

type LoginFormProps = { googleEnabled: boolean; next: string; initialError?: string | null };

export function LoginForm({ googleEnabled, next, initialError = null }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [pending, setPending] = useState(false);

  /** The admin login (ADMIN_USERNAME / ADMIN_PASSWORD) works from this form too and leads to /admin. */
  async function tryAdmin(identifier: string): Promise<"ok" | "no" | string> {
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: identifier, password }),
      });
      if (response.ok) return "ok";
      if (response.status === 429) return "Trop de tentatives. Patiente quelques minutes puis réessaie.";
      return "no";
    } catch {
      return "no";
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const identifier = email.trim();
    const looksLikeEmail = identifier.includes("@");

    // An identifier without "@" cannot be a player account: check the admin login first.
    if (!looksLikeEmail) {
      const admin = await tryAdmin(identifier);
      if (admin === "ok") {
        router.push("/admin");
        router.refresh();
        return;
      }
      setError(admin === "no" ? "Identifiant ou mot de passe incorrect." : admin);
      setPending(false);
      return;
    }

    const result = await signIn.email({ email: identifier, password });
    if (result.error) {
      // The admin login may also be an email address: give it a chance before showing the error.
      const admin = await tryAdmin(identifier);
      if (admin === "ok") {
        router.push("/admin");
        router.refresh();
        return;
      }
      setError(authErrorMessage(result.error));
      setPending(false);
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="text"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="toi@exemple.fr"
        />
      </Field>
      <Field label="Mot de passe" htmlFor="password">
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
      </Field>
      <Button type="submit" disabled={pending || !email || !password}>
        {pending ? "Connexion…" : "Se connecter"}
      </Button>
      {googleEnabled ? (
        <>
          <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-cream-700">
            <span className="h-px flex-1 bg-ink-600" />
            ou
            <span className="h-px flex-1 bg-ink-600" />
          </div>
          <GoogleButton next={next} onError={setError} />
        </>
      ) : null}
      <p className="text-center text-sm text-cream-500">
        Pas encore de compte ?{" "}
        <Link href="/signup" className="font-semibold text-sage-400 underline-offset-4 hover:underline">
          Créer un compte
        </Link>
      </p>
    </form>
  );
}
