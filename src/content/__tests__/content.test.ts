import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACTION_IDS,
  DIALOGUES,
  DIALOGUE_INTENT_IDS,
  LOCALES,
  PET_IDS,
  SHARED_ACTION_IDS,
  SIGNATURE_ACTION_IDS,
  SFX_CUE_IDS,
  TONES,
  resolveLocale,
  selectDialogueLine,
  validateActionCatalog,
  validateDialogueCatalog,
  validateLocalizationContract,
  validateSfxCatalog
} from "..";

async function readPublicFixture(name: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(process.cwd(), "public/content", name), "utf8")) as unknown;
}

async function readActionFixture(): Promise<unknown> {
  return readPublicFixture("actions.v1.json");
}

describe("action content", () => {
  it("validates the canonical Rust-wire catalog", async () => {
    const catalog = validateActionCatalog(await readActionFixture());
    expect(catalog.actions).toHaveLength(ACTION_IDS.length);
    expect(catalog.actions.filter((action) => SIGNATURE_ACTION_IDS.includes(action.id as never))).toHaveLength(12);
    expect(catalog.actions.filter((action) => SHARED_ACTION_IDS.includes(action.id as never))).toHaveLength(5);
    expect(new Set(catalog.actions.map((action) => action.id))).toEqual(new Set(ACTION_IDS));

    for (const action of catalog.actions) {
      expect(action.durationMs).toBeLessThanOrEqual(12_000);
      expect(action.dismissPolicy).toEqual({ firstClickRelocates: true, secondClickWindowMs: 8_000, longPressMs: 700 });
      expect(Object.keys(action).sort()).toEqual(
        [
          "schemaVersion",
          "id",
          "petIds",
          "triggerTags",
          "category",
          "durationMs",
          "motionRig",
          "motionController",
          "inputs",
          "markers",
          "hitRegions",
          "lineKey",
          ...(action.sfxCue ? ["sfxCue"] : []),
          "dismissPolicy"
        ].sort()
      );
    }
  });

  it("rejects unsafe duration, interaction timing, and degenerate hit masks", async () => {
    const fixture = (await readActionFixture()) as { actions: Array<Record<string, unknown>> };

    const tooLong = structuredClone(fixture);
    tooLong.actions[0]!.durationMs = 12_001;
    expect(() => validateActionCatalog(tooLong)).toThrow();

    const wrongClickWindow = structuredClone(fixture);
    wrongClickWindow.actions[0]!.dismissPolicy = {
      firstClickRelocates: true,
      secondClickWindowMs: 9_000,
      longPressMs: 700
    };
    expect(() => validateActionCatalog(wrongClickWindow)).toThrow();

    const zeroArea = structuredClone(fixture);
    zeroArea.actions[0]!.hitRegions = [
      { pose: "idle", polygon: [{ x: 0, y: 0 }, { x: 500, y: 500 }, { x: 1_000, y: 1_000 }] }
    ];
    expect(() => validateActionCatalog(zeroArea)).toThrow();
  });
});

describe("SFX content", () => {
  it("declares every typed cue and covers all manifest references", async () => {
    const sfx = validateSfxCatalog(await readPublicFixture("sfx-cues.v1.json"));
    const actions = validateActionCatalog(await readActionFixture());
    const cueIds = new Set(sfx.cues.map((cue) => cue.id));
    expect(cueIds).toEqual(new Set(SFX_CUE_IDS));
    actions.actions.forEach((action) => {
      if (action.sfxCue) expect(cueIds.has(action.sfxCue)).toBe(true);
    });
  });
});

describe("dialogue content", () => {
  it("matches the public localization contract used by Rust validation", async () => {
    const contract = validateLocalizationContract(await readPublicFixture("localization-contract.v1.json"));
    expect(contract.lineKeys).toEqual(DIALOGUE_INTENT_IDS);
    expect(contract.petIds).toEqual(PET_IDS);
    expect(contract.locales).toEqual(LOCALES);
    expect(contract.tones).toEqual(TONES);
  });

  it("contains all 768 locale/pet/intent/tone lines", () => {
    const catalog = validateDialogueCatalog(DIALOGUES);
    const lineIds = new Set<string>();
    for (const locale of LOCALES) {
      for (const petId of PET_IDS) {
        expect(Object.keys(catalog[locale][petId])).toHaveLength(DIALOGUE_INTENT_IDS.length);
        for (const intent of DIALOGUE_INTENT_IDS) {
          for (const tone of TONES) {
            expect(catalog[locale][petId][intent][tone].trim()).not.toBe("");
            lineIds.add(`${locale}.${petId}.${intent}.${tone}`);
          }
        }
      }
    }
    expect(lineIds).toHaveLength(4 * 4 * 24 * 2);
  });

  it("does not repeat a line used in the last ten episodes", () => {
    const first = selectDialogueLine({ locale: "vi", petId: "goat10", intent: "greeting", tone: "kind" });
    expect(first).not.toBeNull();
    expect(
      selectDialogueLine({
        locale: "vi",
        petId: "goat10",
        intent: "greeting",
        tone: "kind",
        recentLineIds: ["old-1", first!.id]
      })
    ).toBeNull();
    expect(
      selectDialogueLine({
        locale: "vi",
        petId: "goat10",
        intent: "greeting",
        tone: "kind",
        recentLineIds: [first!.id, ...Array.from({ length: 10 }, (_, index) => `new-${index}`)]
      })
    ).toEqual(first);
  });

  it("normalizes supported language tags and safely falls back", () => {
    expect(resolveLocale("vi-VN")).toBe("vi");
    expect(resolveLocale("ko_KR")).toBe("ko");
    expect(resolveLocale("fr-FR")).toBe("en");
    expect(resolveLocale(undefined)).toBe("en");
  });
});
