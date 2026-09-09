import { z } from "zod";
import { USERNAME } from "@/lib/game/config";

const RESERVED = new Set([
  "admin",
  "mealmate",
  "support",
  "root",
  "system",
  "moderateur",
  "moderator",
]);

/** Pseudo rules: 3–20 chars, letters / digits / underscore, not reserved. */
export const usernameSchema = z
  .string()
  .trim()
  .min(USERNAME.min, `Le pseudo doit faire au moins ${USERNAME.min} caractères.`)
  .max(USERNAME.max, `Le pseudo doit faire au plus ${USERNAME.max} caractères.`)
  .regex(
    /^[A-Za-z0-9_]+$/,
    "Le pseudo ne peut contenir que des lettres, des chiffres et des tirets bas.",
  )
  .refine((value) => !RESERVED.has(value.toLowerCase()), {
    message: "Ce pseudo est réservé.",
  });

export function validateUsername(
  input: unknown,
): { ok: true; username: string } | { ok: false; message: string } {
  const result = usernameSchema.safeParse(input);
  if (result.success) return { ok: true, username: result.data };
  return {
    ok: false,
    message: result.error.issues[0]?.message ?? "Pseudo invalide.",
  };
}
