import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { profiles, type Profile } from "@/lib/db/schema";
import { generateFriendCode } from "./friend-code";
import { validateUsername } from "./username";

export async function getProfile(userId: string): Promise<Profile | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ userId: profiles.userId })
    .from(profiles)
    .where(sql`lower(${profiles.username}) = lower(${username})`)
    .limit(1);
  return rows.length === 0;
}

export class UsernameTakenError extends Error {
  readonly code = "username_taken" as const;
  constructor() {
    super("Ce pseudo est déjà pris.");
    this.name = "UsernameTakenError";
  }
}

/** Detects a Postgres unique violation (Neon and PGlite expose slightly different shapes). */
function isUniqueViolation(error: unknown, constraint?: string): boolean {
  if (typeof error !== "object" || error === null) return false;
  const err = error as {
    code?: string;
    constraint?: string;
    constraint_name?: string;
    message?: string;
    cause?: unknown;
  };
  if (err.code !== "23505") {
    return err.cause ? isUniqueViolation(err.cause, constraint) : false;
  }
  if (!constraint) return true;
  const named = err.constraint ?? err.constraint_name ?? "";
  return named === constraint || (err.message ?? "").includes(constraint);
}

/**
 * Creates the profile row for a user. Retries a few times on friend-code
 * collision and throws `UsernameTakenError` when the pseudo already exists.
 */
export async function createProfile(
  userId: string,
  username: string,
): Promise<Profile> {
  const db = getDb();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const rows = await db
        .insert(profiles)
        .values({ userId, username, friendCode: generateFriendCode() })
        .returning();
      return rows[0];
    } catch (error) {
      if (isUniqueViolation(error, "profiles_username_lower_idx")) {
        throw new UsernameTakenError();
      }
      if (isUniqueViolation(error, "profiles_friend_code_unique")) {
        continue;
      }
      throw error;
    }
  }
  throw new Error("Impossible de générer un code ami unique.");
}

/**
 * Best-effort profile creation from the name given at sign-up. Used by the
 * Better Auth `user.create.after` hook: when the name is not a valid or
 * available pseudo (typically a Google display name), the user is sent to
 * `/onboarding` to pick one.
 */
export async function tryCreateProfileFromName(
  userId: string,
  name: string | null | undefined,
): Promise<Profile | null> {
  const validation = validateUsername(name ?? "");
  if (!validation.ok) return null;
  try {
    if (!(await isUsernameAvailable(validation.username))) return null;
    return await createProfile(userId, validation.username);
  } catch (error) {
    if (error instanceof UsernameTakenError) return null;
    console.error("[profile] failed to create profile after sign-up", error);
    return null;
  }
}
