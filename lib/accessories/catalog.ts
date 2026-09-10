import type { Rarity } from "@/lib/game/config";

export const SLOTS = ["head", "eyes", "neck", "body"] as const;
export type Slot = (typeof SLOTS)[number];

export const SLOT_LABELS: Record<Slot, string> = { head: "Tête", eyes: "Yeux", neck: "Cou", body: "Corps" };

export type Accessory = {
  id: string;
  name: string;
  slot: Slot;
  rarity: Rarity;
  /** One-line flavour text shown in the wardrobe / reward screen. */
  tagline: string;
};

/** ~30 accessories (spec § 5.2). Rendering lives in components/accessories/. */
export const ACCESSORIES: readonly Accessory[] = [
  // Head
  { id: "straw_hat", name: "Chapeau de paille", slot: "head", rarity: "commun", tagline: "Pour les balades au soleil." },
  { id: "beret", name: "Béret", slot: "head", rarity: "commun", tagline: "Très chic, très baguette." },
  { id: "beanie", name: "Bonnet", slot: "head", rarity: "commun", tagline: "Chaud aux oreilles." },
  { id: "cap", name: "Casquette", slot: "head", rarity: "commun", tagline: "Visière en avant, toujours." },
  { id: "nightcap", name: "Bonnet de nuit", slot: "head", rarity: "commun", tagline: "Pour les siestes bien méritées." },
  { id: "head_bow", name: "Nœud sur la tête", slot: "head", rarity: "commun", tagline: "Un petit nœud coquet." },
  { id: "flower_crown", name: "Couronne de fleurs", slot: "head", rarity: "rare", tagline: "Cueillie au printemps." },
  { id: "top_hat", name: "Haut-de-forme", slot: "head", rarity: "rare", tagline: "Élégance de gala." },
  { id: "viking_helmet", name: "Casque viking", slot: "head", rarity: "rare", tagline: "Pour les longues marches." },
  { id: "wizard_hat", name: "Chapeau de sorcier", slot: "head", rarity: "tres_rare", tagline: "Un peu de magie dans l'assiette." },
  { id: "crown", name: "Couronne", slot: "head", rarity: "tres_rare", tagline: "Pour une créature royale." },
  { id: "halo", name: "Auréole", slot: "head", rarity: "legendaire", tagline: "Un ange passe." },
  // Eyes
  { id: "round_glasses", name: "Lunettes rondes", slot: "eyes", rarity: "commun", tagline: "Regard de bibliothèque." },
  { id: "sunglasses", name: "Lunettes de soleil", slot: "eyes", rarity: "commun", tagline: "Trop cool pour cligner." },
  { id: "goggles", name: "Lunettes de plongée", slot: "eyes", rarity: "commun", tagline: "Prêt·e pour la piscine." },
  { id: "monocle", name: "Monocle", slot: "eyes", rarity: "rare", tagline: "Inspecte chaque légume." },
  { id: "hero_mask", name: "Masque de héros", slot: "eyes", rarity: "rare", tagline: "Identité secrète." },
  { id: "star_glasses", name: "Lunettes étoiles", slot: "eyes", rarity: "tres_rare", tagline: "Des étoiles plein les yeux." },
  // Neck
  { id: "scarf", name: "Écharpe", slot: "neck", rarity: "commun", tagline: "Tricotée avec amour." },
  { id: "bow_tie", name: "Nœud papillon", slot: "neck", rarity: "commun", tagline: "Pour les grandes occasions." },
  { id: "bandana", name: "Bandana", slot: "neck", rarity: "commun", tagline: "Esprit aventurier." },
  { id: "bell_collar", name: "Collier à clochette", slot: "neck", rarity: "commun", tagline: "On l'entend arriver." },
  { id: "kerchief", name: "Foulard", slot: "neck", rarity: "commun", tagline: "Léger comme une brise." },
  { id: "pearl_necklace", name: "Collier de perles", slot: "neck", rarity: "rare", tagline: "Trouvé au bord de l'eau." },
  { id: "medal", name: "Médaille", slot: "neck", rarity: "rare", tagline: "Récompense de marcheur·se." },
  // Body
  { id: "apron", name: "Tablier", slot: "body", rarity: "commun", tagline: "Chef·fe en cuisine." },
  { id: "vest", name: "Gilet", slot: "body", rarity: "commun", tagline: "Douillet et boutonné." },
  { id: "backpack", name: "Sac à dos", slot: "body", rarity: "rare", tagline: "Pour les randonnées." },
  { id: "cape", name: "Cape", slot: "body", rarity: "tres_rare", tagline: "Flotte au vent." },
  { id: "butterfly_wings", name: "Ailes de papillon", slot: "body", rarity: "legendaire", tagline: "Légères comme un rêve." },
];

const BY_ID = new Map(ACCESSORIES.map((a) => [a.id, a]));

export function getAccessory(id: string): Accessory | undefined {
  return BY_ID.get(id);
}

export function accessoriesForSlot(slot: Slot): Accessory[] {
  return ACCESSORIES.filter((a) => a.slot === slot);
}

export function accessoriesByRarity(): Record<Rarity, Accessory[]> {
  const groups: Record<Rarity, Accessory[]> = { commun: [], rare: [], tres_rare: [], legendaire: [] };
  for (const accessory of ACCESSORIES) groups[accessory.rarity].push(accessory);
  return groups;
}
