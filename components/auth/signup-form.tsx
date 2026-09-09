"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { signUp } from "@/lib/auth/client";
import { USERNAME } from "@/lib/game/config";
import { validateUsername } from "@/lib/profile/username";
import { authErrorMessage } from "./auth-errors";
import { GoogleButton } from "./google-button";
import { PasswordInput } from "./password-input";

type SignupFormProps = { googleEnabled: boolean };

type CheckResponse = { valid: boolean; available: boolean; message?: string };

export function SignupForm({ googleEnabled }: SignupFormProps) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setUsernameError(null);

    const validation = validateUsername(username);
    if (!validation.ok) {
      setUsernameError(validation.message);
      return;
    }
    if (password.length < 8) {
      setError("Le mot de passe doit faire au moins 8 caractères.");
      return;
    }

    setPending(true);
    try {
      const check = await fetch(
        `/api/profile/check?username=${encodeURIComponent(validation.username)}`,
        { cache: "no-store" },
      );
      if (check.ok) {
        const body = (await check.json()) as CheckResponse;
        if (!body.valid || !body.available) {
          setUsernameError(body.message ?? "Ce pseudo est déjà pris.");
          setPending(false);
          return;
        }
      } else if (check.status === 503) {
        setError(authErrorMessage({ status: 503 }));
        setPending(false);
        return;
      }

      const result = await signUp.email({
        name: validation.username,
        email: email.trim(),
        password,
      });
      if (result.error) {
        setError(authErrorMessage(result.error));
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
        label="Pseudo"
        htmlFor="username"
        error={usernameError}
        hint={`${USERNAME.min} à ${USERNAME.max} caractères, lettres, chiffres et tirets bas. Tes amis te retrouveront avec.`}
      >
        <Input
          id="username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          maxLength={USERNAME.max}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="ex. Chabond_42"
          aria-invalid={usernameError ? true : undefined}
        />
      </Field>
      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="toi@exemple.fr"
        />
      </Field>
      <Field label="Mot de passe" htmlFor="password" hint="8 caractères minimum.">
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
      </Field>
      <Button type="submit" disabled={pending || !username || !email || !password}>
        {pending ? "Création du compte…" : "Créer mon compte"}
      </Button>
      {googleEnabled ? (
        <>
          <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-cream-700">
            <span className="h-px flex-1 bg-ink-600" />
            ou
            <span className="h-px flex-1 bg-ink-600" />
          </div>
          <GoogleButton onError={setError} />
        </>
      ) : null}
      <p className="text-center text-xs leading-relaxed text-cream-500">
        En créant un compte, tu acceptes notre{" "}
        <Link href="/privacy" className="underline underline-offset-4">
          politique de confidentialité
        </Link>
        .
      </p>
      <p className="text-center text-sm text-cream-500">
        Déjà un compte ?{" "}
        <Link href="/login" className="font-semibold text-sage-400 underline-offset-4 hover:underline">
          Se connecter
        </Link>
      </p>
    </form>
  );
}
