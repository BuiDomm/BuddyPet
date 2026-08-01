import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DIALOGUES, LOCALES } from "../../content";
import { createBuddyPetI18n, dialogueTranslationKey, resources } from "..";
import { uiTranslationKeys } from "../resources";

describe("BuddyPet i18n", () => {
  it.each(LOCALES)("initializes bundled %s resources", async (locale) => {
    const instance = await createBuddyPetI18n({ locale, detectLanguage: false });
    expect(instance.resolvedLanguage).toBe(locale);
    expect(instance.t("app.name")).toBe("BuddyPet");
    expect(instance.t(dialogueTranslationKey("goat10", "greeting", "kind"))).toBe(DIALOGUES[locale].goat10.greeting.kind);
  });

  it("falls back to English for unsupported language tags", async () => {
    const instance = await createBuddyPetI18n({ detectLanguage: false });
    await instance.changeLanguage("fr-FR");
    expect(instance.t("tray.hideNow")).toBe("Hide now");
  });

  it("ships every UI key in all four locales without defaultValue fallback", async () => {
    const sourceFiles = [
      "src/features/onboarding/Onboarding.tsx",
      "src/features/overlay/PetStage.tsx",
      "src/features/settings/SettingsApp.tsx",
      "src/features/settings/SettingsPages.tsx",
      "src/components/BuddyCharacter.tsx",
    ];
    const literalKeys = new Set<string>();
    for (const file of sourceFiles) {
      const source = await readFile(resolve(process.cwd(), file), "utf8");
      for (const match of source.matchAll(/\bt\(\s*["`]([^"`$]+)["`]/g)) {
        if (match[1]) literalKeys.add(match[1]);
      }
    }
    const dynamicKeys = [
      ...["home", "buddies", "mischief", "routine", "sound", "privacy", "accessibility", "playground"].map((key) => `navigation.${key}`),
      ...["goat10", "camel7", "memeCat", "shiba"].flatMap((pet) => [`pets.${pet}.name`, `pets.${pet}.tagline`]),
      ...["goat10", "camel7", "memeCat", "shiba"].flatMap((pet) => [`playground.lines.${pet}.kind`, `playground.lines.${pet}.sassy`]),
      ...["headbutt", "nibble", "dribble", "stretch", "chew", "splash", "slap", "scratch", "loaf", "tug", "dig", "zoomies"].map((action) => `actions.${action}`),
      ...["gentle", "playful", "chaos"].map((intensity) => `intensity.${intensity}`),
    ];
    dynamicKeys.forEach((key) => literalKeys.add(key));

    expect(uiTranslationKeys.length).toBeGreaterThan(250);
    for (const locale of LOCALES) {
      const translation = resources[locale].translation as Record<string, string>;
      for (const key of literalKeys) {
        expect(translation[key], `${locale} is missing ${key}`).toBeTruthy();
      }
    }
  });

  it.each([
    ["vi", "navigation.home", "Trang chủ"],
    ["en", "navigation.home", "Home"],
    ["ko", "navigation.home", "홈"],
    ["ja", "navigation.home", "ホーム"],
  ] as const)("renders %s menu copy from its own catalog", async (locale, key, expected) => {
    const instance = await createBuddyPetI18n({ locale, detectLanguage: false });
    expect(instance.t(key)).toBe(expected);
    expect(instance.t("overlay.hide")).not.toBe("overlay.hide");
  });

  it("keeps Korean and Japanese UI copy in the requested writing system", () => {
    const intentionalBrandOnlyKeys = new Set(["app.name", "playground.buddy"]);
    const korean = resources.ko.translation as Record<string, string>;
    const japanese = resources.ja.translation as Record<string, string>;
    for (const key of uiTranslationKeys) {
      if (intentionalBrandOnlyKeys.has(key)) continue;
      expect(korean[key], `Korean copy leaked or was not transcreated: ${key}`).toMatch(/[가-힣]/u);
      expect(japanese[key], `Japanese copy leaked or was not transcreated: ${key}`).toMatch(/[ぁ-ゟ゠-ヿ一-龯]/u);
    }
  });
});
