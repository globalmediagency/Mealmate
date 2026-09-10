"use client";

import { Download, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardText, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { authClient } from "@/lib/auth/client";

const CONFIRM_WORD = "SUPPRIMER";

/** Data export and account deletion (privacy page promises both). */
export function DangerZone({ hasPassword }: { hasPassword: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = word.trim().toUpperCase() === CONFIRM_WORD && (!hasPassword || password.length > 0);

  async function remove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || pending) return;
    setPending(true);
    setError(null);
    try {
      const { error: authError } = await authClient.deleteUser(hasPassword ? { password } : {});
      if (authError) {
        const text = (authError.message ?? "").toLowerCase();
        setError(
          text.includes("password")
            ? "Mot de passe incorrect."
            : text.includes("fresh")
              ? "Par sécurité, déconnecte-toi, reconnecte-toi, puis réessaie."
              : "Suppression impossible pour le moment. Réessaie dans un instant.",
        );
        return;
      }
      router.push("/?deleted=1");
      router.refresh();
    } catch {
      setError("Impossible de joindre le serveur.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div>
        <CardTitle className="text-lg">Mes données</CardTitle>
        <CardText className="mt-1">Tu peux récupérer tout ce que MealMate sait de toi, ou tout effacer.</CardText>
      </div>
      <a
        href="/api/account/export"
        download
        className="inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl border border-ink-500 bg-ink-700 px-6 text-base font-semibold text-cream-100 transition-colors hover:border-ink-400 hover:bg-ink-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-400/70"
      >
        <Download className="h-5 w-5" aria-hidden="true" />
        Exporter mes données (JSON)
      </a>

      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-11 items-center gap-1.5 text-sm text-danger/80 hover:text-danger">
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          Supprimer mon compte
        </button>
      ) : (
        <form onSubmit={remove} className="space-y-3 rounded-2xl border border-danger/40 bg-danger/5 p-4" noValidate>
          <p className="text-sm font-semibold text-cream-50">Supprimer définitivement ton compte ?</p>
          <p className="text-sm leading-relaxed text-cream-300">
            Ta créature, tes repas et leurs photos, tes pas, tes accessoires, tes amis et tes achats seront effacés
            tout de suite, sans retour possible. Le lien Strava est révoqué.
          </p>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <label className="block text-sm text-cream-300" htmlFor="delete-word">
            Tape <strong className="text-cream-50">{CONFIRM_WORD}</strong> pour confirmer
          </label>
          <Input id="delete-word" value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} />
          {hasPassword ? (
            <>
              <label className="block text-sm text-cream-300" htmlFor="delete-password">
                Ton mot de passe
              </label>
              <Input id="delete-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" variant="danger" size="md" disabled={!ready || pending}>
              {pending ? "Suppression…" : "Supprimer définitivement"}
            </Button>
            <Button type="button" variant="ghost" size="md" className="w-auto px-4" onClick={() => setOpen(false)} disabled={pending}>
              Annuler
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
