import { z } from "zod";
import {
  ACTION_IDS,
  BEHAVIOR_GROUPS,
  CONTENT_SCHEMA_VERSION,
  DIALOGUE_INTENT_IDS,
  LOCALES,
  PET_IDS,
  SFX_CUE_IDS,
  SHARED_ACTION_IDS,
  SIGNATURE_ACTION_IDS,
  TONES,
  TRIGGER_TAGS,
  type ActionCatalog,
  type DialogueCatalog,
  type LocalizationContract,
  type SfxCatalog
} from "./types";

export const localeSchema = z.enum(LOCALES);
export const toneSchema = z.enum(TONES);
export const petIdSchema = z.enum(PET_IDS);
export const actionIdSchema = z.enum(ACTION_IDS);
export const dialogueIntentSchema = z.enum(DIALOGUE_INTENT_IDS);
export const behaviorGroupSchema = z.enum(BEHAVIOR_GROUPS);
export const triggerTagSchema = z.enum(TRIGGER_TAGS);
export const sfxCueIdSchema = z.enum(SFX_CUE_IDS);

// Rust's canonical wire type is i32 logical coordinates. Artboards in v1 stay
// within this tighter bound to catch accidental physical-screen coordinates.
const logicalCoordinateSchema = z.number().int().min(-8_192).max(8_192);

export const pointSchema = z.strictObject({
  x: logicalCoordinateSchema,
  y: logicalCoordinateSchema
});

export const hitRegionSchema = z
  .strictObject({
    pose: z.string().trim().min(1).max(64),
    polygon: z.array(pointSchema).min(3)
  })
  .superRefine((region, context) => {
    const twiceArea = region.polygon.reduce((sum, point, index, polygon) => {
      const next = polygon[(index + 1) % polygon.length];
      return next ? sum + point.x * next.y - next.x * point.y : sum;
    }, 0);
    if (Math.abs(twiceArea) < 0.000_001) {
      context.addIssue({ code: "custom", message: "Hit-region polygon must enclose a non-zero area", path: ["polygon"] });
    }
  });

export const dismissPolicySchema = z.strictObject({
  firstClickRelocates: z.boolean(),
  secondClickWindowMs: z.literal(8_000),
  longPressMs: z.literal(700)
});

export const actionManifestSchema = z
  .strictObject({
    schemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
    id: actionIdSchema,
    petIds: z.array(petIdSchema).min(1).max(PET_IDS.length),
    triggerTags: z.array(triggerTagSchema).min(1),
    category: behaviorGroupSchema,
    durationMs: z.number().int().positive().max(12_000),
    riveArtboard: z.string().trim().min(1).max(64),
    stateMachine: z.string().trim().min(1).max(64),
    inputs: z.array(z.string().trim().min(1).max(64)),
    markers: z.array(z.string().trim().min(1).max(64)),
    hitRegions: z.array(hitRegionSchema).min(1),
    lineKey: dialogueIntentSchema,
    sfxCue: sfxCueIdSchema.optional(),
    dismissPolicy: dismissPolicySchema
  })
  .superRefine((action, context) => {
    const uniquePetIds = new Set(action.petIds);
    if (uniquePetIds.size !== action.petIds.length) {
      context.addIssue({ code: "custom", message: "petIds must be unique", path: ["petIds"] });
    }

    const uniqueInputs = new Set(action.inputs);
    if (uniqueInputs.size !== action.inputs.length) {
      context.addIssue({ code: "custom", message: "Rive input names must be unique", path: ["inputs"] });
    }
    const uniqueMarkers = new Set(action.markers);
    if (uniqueMarkers.size !== action.markers.length) {
      context.addIssue({ code: "custom", message: "Marker names must be unique", path: ["markers"] });
    }
    const isSignature = signatureActionIds.has(action.id);
    if (isSignature && action.petIds.length !== 1) {
      context.addIssue({ code: "custom", message: "Signature actions must belong to exactly one pet", path: ["petIds"] });
    }
    if (!isSignature && PET_IDS.some((petId) => !uniquePetIds.has(petId))) {
      context.addIssue({ code: "custom", message: "Shared actions must support all pets", path: ["petIds"] });
    }
  });

const expectedActionIds = new Set<string>(ACTION_IDS);
const signatureActionIds: Set<string> = new Set(SIGNATURE_ACTION_IDS);
const sharedActionIds: Set<string> = new Set(SHARED_ACTION_IDS);
const signatureOwnerByPrefix = {
  goat: "goat10",
  camel: "camel7",
  cat: "memeCat",
  shiba: "shiba"
} as const;

export const actionCatalogSchema = z
  .strictObject({
    schemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
    actions: z.array(actionManifestSchema).length(ACTION_IDS.length)
  })
  .superRefine((catalog, context) => {
    const actualIds: Set<string> = new Set(catalog.actions.map((action) => action.id));
    if (actualIds.size !== catalog.actions.length) {
      context.addIssue({ code: "custom", message: "Action IDs must be unique", path: ["actions"] });
    }
    for (const expectedId of expectedActionIds) {
      if (!actualIds.has(expectedId)) {
        context.addIssue({ code: "custom", message: `Missing action ${expectedId}`, path: ["actions"] });
      }
    }

    const signatureCounts = Object.fromEntries(PET_IDS.map((petId) => [petId, 0])) as Record<(typeof PET_IDS)[number], number>;
    catalog.actions.forEach((action, index) => {
      const isSignature = signatureActionIds.has(action.id);
      const isShared = sharedActionIds.has(action.id);
      if (!isSignature && !isShared) {
        context.addIssue({ code: "custom", message: `${action.id} is not a known action`, path: ["actions", index, "id"] });
      }
      if (isSignature) {
        const petId = action.petIds[0];
        if (petId) signatureCounts[petId] += 1;
        const prefix = action.id.split("-", 1)[0] as keyof typeof signatureOwnerByPrefix;
        if (petId !== signatureOwnerByPrefix[prefix]) {
          context.addIssue({
            code: "custom",
            message: `${action.id} belongs to ${signatureOwnerByPrefix[prefix]}`,
            path: ["actions", index, "petIds"]
          });
        }
      }
    });
    PET_IDS.forEach((petId) => {
      if (signatureCounts[petId] !== 3) {
        context.addIssue({ code: "custom", message: `${petId} must have exactly three signature actions`, path: ["actions"] });
      }
    });
  });

function hasSafeDialogueCharacters(value: string): boolean {
  return [...value].every((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    const isAllowedWhitespace = codePoint === 9 || codePoint === 10 || codePoint === 13;
    return character !== "<" && character !== ">" && (codePoint >= 32 || isAllowedWhitespace);
  });
}

const dialogueTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .refine(hasSafeDialogueCharacters, "Dialogue cannot contain markup or control characters");

export const dialogueVariantSchema = z.strictObject({
  kind: dialogueTextSchema,
  sassy: dialogueTextSchema
});

export const petDialogueSchema = z.record(dialogueIntentSchema, dialogueVariantSchema);
export const localeDialogueSchema = z.record(petIdSchema, petDialogueSchema);
export const dialogueCatalogSchema = z.record(localeSchema, localeDialogueSchema);

function containsEachExactlyOnce<T extends string>(actual: readonly T[], expected: readonly T[]): boolean {
  return actual.length === expected.length && new Set(actual).size === expected.length && expected.every((value) => actual.includes(value));
}

export const localizationContractSchema = z
  .strictObject({
    schemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
    keyModel: z.literal("semantic-intent"),
    rendererKeyTemplate: z.literal("dialogue.{petId}.{lineKey}.{tone}"),
    petIds: z.array(petIdSchema).length(PET_IDS.length),
    locales: z.array(localeSchema).length(LOCALES.length),
    tones: z.array(toneSchema).length(TONES.length),
    lineKeys: z.array(dialogueIntentSchema).length(DIALOGUE_INTENT_IDS.length)
  })
  .superRefine((contract, context) => {
    const dimensions = [
      ["petIds", contract.petIds, PET_IDS],
      ["locales", contract.locales, LOCALES],
      ["tones", contract.tones, TONES],
      ["lineKeys", contract.lineKeys, DIALOGUE_INTENT_IDS]
    ] as const;
    dimensions.forEach(([path, actual, expected]) => {
      if (!containsEachExactlyOnce(actual, expected)) {
        context.addIssue({ code: "custom", message: `${path} must contain every supported value exactly once`, path: [path] });
      }
    });
  });

export const sfxCatalogSchema = z
  .strictObject({
    schemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
    cues: z
      .array(
        z.strictObject({
          id: sfxCueIdSchema,
          scope: z.union([z.literal("common"), petIdSchema]),
          assetPath: z.string().regex(/^sfx\/[a-z0-9-]+\.ogg$/u),
          assetStatus: z.enum(["pending", "ready"])
        })
      )
      .length(SFX_CUE_IDS.length)
  })
  .superRefine((catalog, context) => {
    const ids = new Set(catalog.cues.map((cue) => cue.id));
    if (ids.size !== catalog.cues.length) {
      context.addIssue({ code: "custom", message: "SFX cue IDs must be unique", path: ["cues"] });
    }
    SFX_CUE_IDS.forEach((id) => {
      if (!ids.has(id)) context.addIssue({ code: "custom", message: `Missing SFX cue ${id}`, path: ["cues"] });
    });
  });

export function validateActionCatalog(input: unknown): ActionCatalog {
  return actionCatalogSchema.parse(input) as ActionCatalog;
}

export function validateDialogueCatalog(input: unknown): DialogueCatalog {
  return dialogueCatalogSchema.parse(input) as DialogueCatalog;
}

export function validateSfxCatalog(input: unknown): SfxCatalog {
  return sfxCatalogSchema.parse(input) as SfxCatalog;
}

export function validateLocalizationContract(input: unknown): LocalizationContract {
  return localizationContractSchema.parse(input) as LocalizationContract;
}
