import { randomInt } from "node:crypto";
import { FRIEND_CODE } from "@/lib/game/config";

/** Generates a friend code such as `MM-7K3Q2X` (unambiguous alphabet). */
export function generateFriendCode(
  random: (max: number) => number = (max) => randomInt(max),
): string {
  let body = "";
  for (let i = 0; i < FRIEND_CODE.length; i += 1) {
    body += FRIEND_CODE.alphabet[random(FRIEND_CODE.alphabet.length)];
  }
  return `${FRIEND_CODE.prefix}${body}`;
}

/**
 * Normalises user input (`mm-7k3q2x`, `7K3Q2X`, ` MM 7K3Q2X `) into the
 * canonical form, or returns `null` when it cannot be a valid code.
 */
export function normalizeFriendCode(input: string): string | null {
  const cleaned = input.toUpperCase().replace(/[\s-]/g, "");
  const body = cleaned.startsWith("MM") ? cleaned.slice(2) : cleaned;
  if (body.length !== FRIEND_CODE.length) return null;
  for (const char of body) {
    if (!FRIEND_CODE.alphabet.includes(char)) return null;
  }
  return `${FRIEND_CODE.prefix}${body}`;
}
