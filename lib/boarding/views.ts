import { getOutfit, outfitToEquipped, type EquippedAccessory } from "@/lib/accessories/service";
import { toCreatureView, type CreatureView } from "@/lib/game/creature-view";
import type { GameRules } from "@/lib/game/rules";
import type { PublicProfile } from "@/lib/friends/service";
import { toBoardingView, type BoardingView, type HeldCreatures } from "./service";

/** A creature a friend entrusted to the user, ready for the client. */
export type HostedCreatureView = {
  boarding: BoardingView;
  creature: CreatureView;
  accessories: EquippedAccessory[];
  owner: PublicProfile;
};

/** Client-safe views of the creatures boarded with the user (server only: reads outfits). */
export async function hostedCreatureViews(boarded: HeldCreatures["boarded"], now: Date, rules: GameRules): Promise<HostedCreatureView[]> {
  return Promise.all(
    boarded.map(async (h) => ({
      boarding: toBoardingView(h.boarding, now),
      creature: toCreatureView(h.creature, now, rules),
      accessories: outfitToEquipped(await getOutfit(h.creature.id)),
      owner: h.owner,
    })),
  );
}
