import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createProfile } from "@/lib/profile/service";
import { createTestDatabase, insertTestUser, type TestDatabase } from "@/lib/test/pglite";
import { resolveTheme } from "./catalog";
import { countThemeChoices, getStoredThemeSettings, getThemeSettings, invalidateThemeSettingsCache, setUserTheme, updateThemeSettings } from "./service";

let tdb: TestDatabase;
let alice: string;
let bob: string;

beforeAll(async () => {
  tdb = await createTestDatabase();
  invalidateThemeSettingsCache();
  alice = await insertTestUser(tdb.db, "alice-themes@example.com");
  bob = await insertTestUser(tdb.db, "bob-themes@example.com");
  await createProfile(alice, "AliceTheme");
  await createProfile(bob, "BobTheme");
});

afterAll(async () => {
  await tdb.close();
});

describe("theme settings", () => {
  it("starts with the shipped design as default and everything enabled, then follows the admin", async () => {
    expect(await getThemeSettings()).toEqual({ defaultId: "foret", disabled: new Set() });
    expect(await updateThemeSettings({ id: "plage", enabled: false }, "chef")).toEqual({ defaultId: "foret", disabled: new Set(["plage"]) });
    await expect(updateThemeSettings({ id: "foret", enabled: false }, "chef")).rejects.toMatchObject({ code: "default_theme", status: 400 });
    await expect(updateThemeSettings({ id: "nope", enabled: false }, "chef")).rejects.toMatchObject({ code: "not_found", status: 404 });
    // Promoting a disabled design enables it; the former default stays enabled.
    expect(await updateThemeSettings({ id: "plage", default: true }, "chef")).toEqual({ defaultId: "plage", disabled: new Set() });
    expect((await getStoredThemeSettings()).updatedBy).toBe("chef");
    expect(await updateThemeSettings({ id: "foret", enabled: false }, "chef")).toEqual({ defaultId: "plage", disabled: new Set(["foret"]) });
    expect(resolveTheme("foret", await getThemeSettings()).id).toBe("plage");
    expect(resolveTheme("velours", await getThemeSettings()).id).toBe("velours");
    await updateThemeSettings({ id: "foret", default: true }, "chef");
    expect(await getThemeSettings()).toEqual({ defaultId: "foret", disabled: new Set() });
  });

  it("stores a player's choice, refuses a disabled or unknown design and counts the choices", async () => {
    expect(await countThemeChoices()).toEqual({});
    expect(await setUserTheme(alice, "velours")).toBe("velours");
    expect(await setUserTheme(bob, "velours")).toBe("velours");
    await expect(setUserTheme(alice, "inconnu")).rejects.toMatchObject({ code: "not_found", status: 404 });
    await updateThemeSettings({ id: "sable", enabled: false }, "chef");
    await expect(setUserTheme(alice, "sable")).rejects.toMatchObject({ code: "theme_disabled", status: 400 });
    expect(await countThemeChoices()).toEqual({ velours: 2 });
    expect(await setUserTheme(alice, null)).toBeNull();
    expect(await countThemeChoices()).toEqual({ velours: 1 });
    await expect(setUserTheme("nobody", "rose")).rejects.toMatchObject({ code: "not_found" });
    await updateThemeSettings({ id: "sable", enabled: true }, "chef");
  });
});
