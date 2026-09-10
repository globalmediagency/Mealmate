import type { Rarity, Tier } from "@/lib/game/config";

export type BodyType = "round" | "tall" | "blob" | "egg" | "serpent";
export type EarType = "cat" | "rabbit" | "fox" | "round" | "horns" | "fold" | "pig" | "none";
export type EyeType = "big" | "sleepy" | "sharp" | "sparkle";
export type MouthType = "smile" | "small" | "beak" | "tongue" | "snout" | "fangs" | "w";
export type TailType = "curl" | "fluffy" | "thin" | "feather" | "stub" | "puff" | "none";
export type MarkingType =
  | "belly_patch"
  | "stripes"
  | "spots"
  | "mask"
  | "shell"
  | "spikes"
  | "crescent"
  | "none";
/** Extras are reserved to very rare / legendary species. */
export type ExtraType = "wings" | "halo" | "crystals" | "flames" | "aura";
/** Small signature item worn from the "Sage" stage on. */
export type SignatureType =
  | "bow"
  | "scarf"
  | "leaf"
  | "monocle"
  | "crown"
  | "flower"
  | "bell"
  | "star_pin"
  | "pearl"
  | "bandana";

export type Point = readonly [number, number];

export type SpeciesPalette = {
  primary: string;
  secondary: string;
  accent: string;
  eye: string;
};

export type SpeciesParts = {
  body: BodyType;
  ears: EarType;
  eyes: EyeType;
  mouth: MouthType;
  tail: TailType;
  markings: MarkingType;
  extra: ExtraType | ExtraType[] | null;
};

/** Anchor points (viewBox 0 0 100 100) used to place accessories. */
export type SpeciesAnchors = {
  head: Point;
  eyes: Point;
  neck: Point;
  body: Point;
};

export type Species = {
  id: string;
  tier: Tier;
  rarity: Rarity;
  name: string;
  tagline: string;
  palette: SpeciesPalette;
  parts: SpeciesParts;
  anchors: SpeciesAnchors;
  signature: SignatureType;
};

/** Public projection sent to the client. */
export type SpeciesSummary = Pick<Species, "id" | "tier" | "rarity" | "name" | "tagline">;

export function toSpeciesSummary(species: Species): SpeciesSummary {
  return {
    id: species.id,
    tier: species.tier,
    rarity: species.rarity,
    name: species.name,
    tagline: species.tagline,
  };
}

/** Default anchors for each body silhouette. */
export const DEFAULT_ANCHORS: Record<BodyType, SpeciesAnchors> = {
  round: { head: [50, 17], eyes: [50, 40], neck: [50, 60], body: [50, 74] },
  tall: { head: [50, 15], eyes: [50, 36], neck: [50, 56], body: [50, 74] },
  blob: { head: [50, 22], eyes: [50, 48], neck: [50, 66], body: [50, 72] },
  egg: { head: [50, 19], eyes: [50, 42], neck: [50, 60], body: [50, 72] },
  serpent: { head: [62, 20], eyes: [62, 32], neck: [62, 44], body: [50, 72] },
};
