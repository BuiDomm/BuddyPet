import { describe, expect, it } from "vitest";
import { DIALOGUES, LOCALES } from "../../content";
import { createBuddyPetI18n, dialogueTranslationKey } from "..";

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
});
