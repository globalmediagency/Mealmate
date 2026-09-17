"use client";

import { Check, Copy, KeyRound, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import type { PasswordResetLink } from "@/lib/admin/accounts";
import { cn } from "@/lib/utils/cn";

type Props = { userId: string; username: string; email: string };

const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    if (body.error?.message) return body.error.message;
  } catch {
    // Not JSON: fall through.
  }
  return response.status === 401 ? "Session admin expirée : reconnecte-toi." : "Une erreur est survenue. Réessaie.";
}

/**
 * Account actions on a player's admin card (spec § 3.20): a one-time password
 * link to pass on to the player, and the deletion of the account, confirmed
 * by typing the pseudo.
 */
export function PlayerActions({ userId, username, email }: Props) {
  const router = useRouter();
  const [link, setLink] = useState<PasswordResetLink | null>(null);
  const [copied, setCopied] = useState(false);
  const [linkPending, setLinkPending] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [word, setWord] = useState("");
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);

  async function makeLink() {
    if (linkPending) return;
    setLinkPending(true);
    setLinkError(null);
    setCopied(false);
    try {
      const response = await fetch(`/api/admin/players/${encodeURIComponent(userId)}/reset-link`, { method: "POST" });
      if (!response.ok) {
        setLinkError(await readError(response));
        return;
      }
      setLink((await response.json()) as PasswordResetLink);
    } catch {
      setLinkError("Impossible de joindre le serveur.");
    } finally {
      setLinkPending(false);
    }
  }

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
    } catch {
      setLinkError("Copie impossible : sélectionne le lien et copie-le à la main.");
    }
  }

  const ready = word.trim().toLowerCase() === username.trim().toLowerCase();

  async function remove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || deletePending) return;
    setDeletePending(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/admin/players/${encodeURIComponent(userId)}`, { method: "DELETE" });
      if (!response.ok) {
        setDeleteError(await readError(response));
        return;
      }
      setDeleted(true);
      router.refresh();
    } catch {
      setDeleteError("Impossible de joindre le serveur.");
    } finally {
      setDeletePending(false);
    }
  }

  if (deleted) {
    return (
      <Alert tone="success" className="mt-4">
        Le compte de {username} a été supprimé.
      </Alert>
    );
  }

  return (
    <section className="mt-4 space-y-3" aria-label={`Compte de ${username}`} data-player-actions={userId}>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={makeLink}
          disabled={linkPending}
          className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-ink-500 bg-ink-700 px-4 text-sm font-semibold text-cream-100 hover:border-ink-400 hover:bg-ink-600 disabled:opacity-50"
          data-reset-link
        >
          <KeyRound className="h-4 w-4" aria-hidden="true" />
          {linkPending ? "Création…" : link ? "Nouveau lien de mot de passe" : "Lien de nouveau mot de passe"}
        </button>
        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-danger/40 bg-danger/10 px-4 text-sm font-semibold text-danger hover:bg-danger/20"
            data-delete-account
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Supprimer le compte
          </button>
        ) : null}
      </div>

      {linkError ? <Alert tone="danger">{linkError}</Alert> : null}
      {link ? (
        <div className="space-y-2 rounded-2xl border border-ink-600/60 bg-ink-900/50 p-3" data-reset-link-box>
          <p className="text-xs text-cream-300">
            Envoie ce lien à <strong className="text-cream-100">{link.email}</strong> par le moyen de ton choix : le joueur choisira un nouveau mot de passe. Valable{" "}
            {link.validHours} h (jusqu&apos;au {fmtDateTime(link.expiresAt)}), utilisable une seule fois ; ses autres sessions seront fermées au changement.
          </p>
          <div className="flex gap-2">
            <input
              readOnly
              value={link.url}
              onFocus={(event) => event.currentTarget.select()}
              aria-label="Lien de nouveau mot de passe"
              className="min-h-11 w-full rounded-xl border border-ink-500 bg-ink-900 px-3 font-mono text-xs text-cream-100"
            />
            <button
              type="button"
              onClick={copyLink}
              className={cn("inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-semibold", copied ? "bg-health/20 text-health" : "bg-sage-500 text-ink-950 hover:bg-sage-400")}
            >
              {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
              {copied ? "Copié" : "Copier"}
            </button>
          </div>
        </div>
      ) : null}

      {confirming ? (
        <form onSubmit={remove} className="space-y-3 rounded-2xl border border-danger/40 bg-danger/5 p-4" noValidate data-delete-form>
          <p className="text-sm font-semibold text-cream-50">Supprimer définitivement le compte de {username} ?</p>
          <p className="text-sm leading-relaxed text-cream-300">
            Sa créature, ses repas et leurs photos, ses pas, ses accessoires, ses amitiés, ses achats et ses parties seront effacés tout de suite, sans retour possible. Le lien
            Strava est révoqué et le joueur est déconnecté partout. ({email})
          </p>
          {deleteError ? <Alert tone="danger">{deleteError}</Alert> : null}
          <label className="block text-sm text-cream-300" htmlFor={`delete-${userId}`}>
            Tape le pseudo <strong className="text-cream-100">{username}</strong> pour confirmer
          </label>
          <input
            id={`delete-${userId}`}
            value={word}
            onChange={(event) => setWord(event.target.value)}
            autoComplete="off"
            className="min-h-11 w-full rounded-xl border border-ink-500 bg-ink-900 px-3 text-base text-cream-50"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={!ready || deletePending}
              className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-danger px-4 text-sm font-semibold text-cream-50 disabled:opacity-50"
              data-delete-confirm
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              {deletePending ? "Suppression…" : "Supprimer ce compte"}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                setWord("");
                setDeleteError(null);
              }}
              className="inline-flex min-h-11 items-center rounded-2xl px-4 text-sm text-cream-300 hover:bg-ink-700 hover:text-cream-100"
            >
              Annuler
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
