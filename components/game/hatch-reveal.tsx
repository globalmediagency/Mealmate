"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Creature } from "@/components/creatures/creature";
import { RARITY_COLORS, RarityBadge } from "@/components/creatures/rarity-badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { getSpecies } from "@/lib/creatures";
import { CREATURE_NAME } from "@/lib/game/config";
import type { CreatureView } from "@/lib/game/creature-view";

type HatchRevealProps = {
  creature: CreatureView;
  /** Called after the name is saved (defaults to a router refresh). */
  onNamed?: (creature: CreatureView) => void;
};

/** Species reveal (with special effects for rare hatches) followed by the naming form. */
export function HatchReveal({ creature, onNamed }: HatchRevealProps) {
  const router = useRouter();
  const species = creature.species ? getSpecies(creature.species.id) : undefined;
  const rarity = creature.rarity ?? "commun";
  const special = rarity === "tres_rare" || rarity === "legendaire";
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < CREATURE_NAME.min || trimmed.length > CREATURE_NAME.max) {
      setError(`Le nom doit faire entre ${CREATURE_NAME.min} et ${CREATURE_NAME.max} caractères.`);
      return;
    }
    setError(null);
    setPending(true);
    try {
      const response = await fetch("/api/creatures/name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const body = (await response.json().catch(() => null)) as
        | { creature: CreatureView }
        | { error: { message: string } }
        | null;
      if (!response.ok || !body || "error" in body) {
        setError(body && "error" in body ? body.error.message : "Impossible d'enregistrer le nom.");
        setPending(false);
        return;
      }
      if (onNamed) onNamed(body.creature);
      else router.refresh();
    } catch {
      setError("Impossible de joindre le serveur.");
      setPending(false);
    }
  }

  if (!species) {
    return <Alert tone="danger">Espèce inconnue. Recharge la page.</Alert>;
  }

  return (
    <div className="space-y-6 animate-rise">
      <div className="relative overflow-hidden rounded-3xl border border-ink-600/80 bg-ink-800/90 px-4 pb-6 pt-8 text-center shadow-card">
        {special ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 mm-rays"
            style={{
              background: `conic-gradient(from 0deg, transparent 0deg, ${RARITY_COLORS[rarity]}33 20deg, transparent 40deg, transparent 60deg, ${RARITY_COLORS[rarity]}33 80deg, transparent 100deg, transparent 120deg, ${RARITY_COLORS[rarity]}33 140deg, transparent 160deg, transparent 180deg, ${RARITY_COLORS[rarity]}33 200deg, transparent 220deg, transparent 240deg, ${RARITY_COLORS[rarity]}33 260deg, transparent 280deg, transparent 300deg, ${RARITY_COLORS[rarity]}33 320deg, transparent 340deg)`,
            }}
          />
        ) : null}
        {special ? (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            {Array.from({ length: 14 }).map((_, i) => (
              <span
                key={i}
                className="mm-confetti absolute top-0 block h-2 w-2 rounded-sm"
                style={{
                  left: `${6 + ((i * 37) % 88)}%`,
                  backgroundColor: i % 3 === 0 ? RARITY_COLORS[rarity] : i % 3 === 1 ? "#F7F4EC" : "#E38EA5",
                  animationDelay: `${(i % 7) * 0.18}s`,
                  animationDuration: `${2.4 + (i % 4) * 0.4}s`,
                }}
              />
            ))}
          </div>
        ) : null}
        <div
          className="relative mx-auto mb-2 flex items-center justify-center rounded-full mm-pop-in"
          style={{ width: 220, height: 220, boxShadow: `0 0 60px ${RARITY_COLORS[rarity]}55` }}
        >
          <Creature species={species} stage="bebe" state="healthy" size={220} reaction="tap" />
        </div>
        <p className="text-xs uppercase tracking-[0.2em] text-cream-500">C&apos;est un…</p>
        <h1 className="mt-1 font-display text-4xl font-semibold text-cream-50">{species.name}</h1>
        <div className="mt-2 flex justify-center">
          <RarityBadge rarity={rarity} />
        </div>
        <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-cream-300">{species.tagline}</p>
        {special ? (
          <p className="mt-2 text-sm font-semibold" style={{ color: RARITY_COLORS[rarity] }}>
            {rarity === "legendaire" ? "Incroyable, une créature légendaire !" : "Quelle chance, une créature très rare !"}
          </p>
        ) : null}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-3xl border border-ink-600/80 bg-ink-800/90 p-5 shadow-card" noValidate>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Field label="Donne-lui un nom" htmlFor="creature-name" hint={`${CREATURE_NAME.min} à ${CREATURE_NAME.max} caractères.`}>
          <Input
            id="creature-name"
            name="name"
            autoComplete="off"
            autoFocus
            maxLength={CREATURE_NAME.max}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`ex. ${species.name === "Chabond" ? "Miso" : "Noisette"}`}
            className="text-lg"
          />
        </Field>
        <Button type="submit" disabled={pending || name.trim().length < CREATURE_NAME.min}>
          {pending ? "Enregistrement…" : "C'est son nom !"}
        </Button>
      </form>
    </div>
  );
}
