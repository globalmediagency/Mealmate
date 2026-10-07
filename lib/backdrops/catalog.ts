import { RARITIES, type Rarity } from "@/lib/game/config";
import { THEME_IDS, type ThemeId } from "@/lib/themes/catalog";

/**
 * The scenes drawn behind the creature. One per site design (always
 * available, drawn with that design's colours; the default follows the design
 * in force) and ten more that step chests hand out at random (spec § 3.28).
 * Pure and importable from the client: the drawings live in
 * `components/backdrops/`, the ownership in `lib/backdrops/service.ts`.
 */
export const THEME_BACKDROP_IDS = ["foret", "sable", "plage", "rose", "velours"] as const;
export const CHEST_BACKDROP_IDS = ["prairie", "lagon", "neige", "savane", "cerisiers", "aurore", "orage", "volcan", "cite", "galaxie"] as const;
export const BACKDROP_IDS = [...THEME_BACKDROP_IDS, ...CHEST_BACKDROP_IDS] as const;
export type BackdropId = (typeof BACKDROP_IDS)[number];

export type Backdrop = {
  id: BackdropId;
  name: string;
  /** One kind sentence shown when the backdrop is found or picked. */
  tagline: string;
  rarity: Rarity;
  /** The design this backdrop belongs to (always available; the default when the creature has no pick). */
  theme?: ThemeId;
};

export const BACKDROPS: readonly Backdrop[] = [
  { id: "foret", name: "Forêt de nuit", tagline: "La clairière de toujours, sous les lucioles.", rarity: "commun", theme: "foret" },
  { id: "sable", name: "Dunes de sable", tagline: "Du sable chaud à perte de vue et un ciel de lin.", rarity: "commun", theme: "sable" },
  { id: "plage", name: "Bord de mer", tagline: "Des vagues douces et une plage de sable clair.", rarity: "commun", theme: "plage" },
  { id: "rose", name: "Jardin poudré", tagline: "Un jardin rose au petit matin, tout en pétales.", rarity: "commun", theme: "rose" },
  { id: "velours", name: "Salon de velours", tagline: "Rideaux sombres, lustre doré et lumière tamisée.", rarity: "commun", theme: "velours" },
  { id: "prairie", name: "Prairie d'été", tagline: "De l'herbe haute, des coquelicots et un grand soleil.", rarity: "commun" },
  { id: "lagon", name: "Lagon turquoise", tagline: "Une eau claire, des palmiers et du sable blanc.", rarity: "commun" },
  { id: "neige", name: "Nuit de neige", tagline: "Des sapins enneigés et des flocons qui tombent doucement.", rarity: "commun" },
  { id: "savane", name: "Savane dorée", tagline: "Un acacia au coucher du soleil, l'herbe blonde.", rarity: "commun" },
  { id: "cerisiers", name: "Cerisiers en fleurs", tagline: "Des branches roses au-dessus d'un étang tranquille.", rarity: "rare" },
  { id: "aurore", name: "Aurore boréale", tagline: "Des voiles verts et violets dansent au-dessus des glaces.", rarity: "rare" },
  { id: "orage", name: "Orage lointain", tagline: "Des nuages lourds, un éclair au loin, et toi bien à l'abri.", rarity: "rare" },
  { id: "volcan", name: "Volcan endormi", tagline: "Une lave paisible qui rougeoie dans le soir.", rarity: "tres_rare" },
  { id: "cite", name: "Toits de la ville", tagline: "Les fenêtres allumées d'une ville qui s'endort.", rarity: "tres_rare" },
  { id: "galaxie", name: "Voie lactée", tagline: "Une nuit sans lune, des milliards d'étoiles et une planète.", rarity: "legendaire" },
];

const BY_ID = new Map<string, Backdrop>(BACKDROPS.map((b) => [b.id, b]));

/** The five backdrops tied to a design (always available, never drawn from a chest). */
export const THEME_BACKDROPS: readonly Backdrop[] = THEME_BACKDROP_IDS.map((id) => BY_ID.get(id)!);
/** The backdrops step chests hand out. */
export const CHEST_BACKDROPS: readonly Backdrop[] = CHEST_BACKDROP_IDS.map((id) => BY_ID.get(id)!);

export function isBackdropId(value: unknown): value is BackdropId {
  return typeof value === "string" && BY_ID.has(value);
}

export function getBackdrop(id: string): Backdrop | undefined {
  return BY_ID.get(id);
}

/** The backdrop drawn by default under a design (its own scene). */
export function backdropForTheme(theme: ThemeId): Backdrop {
  const found = THEME_BACKDROPS.find((b) => b.theme === theme);
  if (!found) throw new Error(`No backdrop for theme ${theme}.`);
  return found;
}

/**
 * The backdrop to draw behind a creature: its own pick when it names a known
 * backdrop, else the scene of the design in force (`null` = follow the design).
 */
export function resolveBackdrop(choice: string | null | undefined, theme: ThemeId): Backdrop {
  if (choice && isBackdropId(choice)) return BY_ID.get(choice)!;
  return backdropForTheme(theme);
}

/** Chest backdrops the player has not found yet. */
export function missingChestBackdrops(ownedIds: ReadonlySet<string>): Backdrop[] {
  return CHEST_BACKDROPS.filter((b) => !ownedIds.has(b.id));
}

/** Backdrops grouped by rarity (admin displays, tests). */
export function backdropsByRarity(list: readonly Backdrop[] = CHEST_BACKDROPS): Record<Rarity, Backdrop[]> {
  const groups = Object.fromEntries(RARITIES.map((r) => [r, [] as Backdrop[]])) as Record<Rarity, Backdrop[]>;
  for (const b of list) groups[b.rarity].push(b);
  return groups;
}

// Every design has its scene: `backdropForTheme` can never throw at runtime.
for (const theme of THEME_IDS) backdropForTheme(theme);
