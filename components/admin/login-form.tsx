"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { PasswordInput } from "@/components/auth/password-input";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export function AdminLoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(body?.error?.message ?? "Connexion refusée.");
        setPending(false);
        return;
      }
      router.push("/admin");
      router.refresh();
    } catch {
      setError("Impossible de joindre le serveur.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label="Identifiant" htmlFor="admin-username">
        <Input id="admin-username" autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} required />
      </Field>
      <Field label="Mot de passe" htmlFor="admin-password">
        <PasswordInput id="admin-password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </Field>
      <Button type="submit" disabled={pending || !username || !password}>
        {pending ? "Connexion…" : "Se connecter"}
      </Button>
    </form>
  );
}

export function AdminLogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function logout() {
    setPending(true);
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => null);
    router.push("/admin/login");
    router.refresh();
  }
  return (
    <Button variant="ghost" size="md" className="w-auto" onClick={logout} disabled={pending}>
      <LogOut className="h-4 w-4" aria-hidden="true" />
      Déconnexion
    </Button>
  );
}
