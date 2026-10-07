"use client";

import { resolveBackdrop } from "@/lib/backdrops/catalog";
import type { Tier } from "@/lib/game/config";
import { useThemeId } from "@/components/theme/theme-context";
import { Backdrop } from "./index";

type SceneBackdropProps = {
  /** The creature's pick (`creatures.backdrop`), `null` = the scene of the design in force. */
  choice: string | null | undefined;
  tier: Tier;
  className?: string;
};

/** The backdrop behind a creature: its own pick, else the scene of the current design (followed live when the design changes). */
export function SceneBackdrop({ choice, tier, className }: SceneBackdropProps) {
  const theme = useThemeId();
  return <Backdrop id={resolveBackdrop(choice, theme).id} tier={tier} className={className} />;
}
