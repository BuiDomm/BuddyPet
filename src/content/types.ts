export const CONTENT_SCHEMA_VERSION = 1 as const;

export const LOCALES = ["vi", "en", "ko", "ja"] as const;
export type Locale = (typeof LOCALES)[number];

export const TONES = ["kind", "sassy"] as const;
export type Tone = (typeof TONES)[number];

export const PET_IDS = ["goat10", "camel7", "memeCat", "shiba"] as const;
export type PetId = (typeof PET_IDS)[number];

export const SIGNATURE_ACTION_IDS = [
  "goat-headbutt-crack",
  "goat-nibble-corner",
  "goat-dribble-celebrate",
  "camel-neck-stretch",
  "camel-chew-fold",
  "camel-spit-wipe",
  "cat-card-slap",
  "cat-image-scratch",
  "cat-cursor-loaf",
  "shiba-tug-strip",
  "shiba-dig-ui",
  "shiba-zoomies"
] as const;
export type SignatureActionId = (typeof SIGNATURE_ACTION_IDS)[number];

export const SHARED_ACTION_IDS = [
  "shared-edge-peek",
  "shared-corner-nap",
  "shared-break-ticket",
  "shared-sticky-note",
  "shared-confetti-pop"
] as const;
export type SharedActionId = (typeof SHARED_ACTION_IDS)[number];

export const ACTION_IDS = [...SIGNATURE_ACTION_IDS, ...SHARED_ACTION_IDS] as const;
export type ActionId = (typeof ACTION_IDS)[number];

export const SFX_CUE_IDS = [
  "soft-pop",
  "paper-pop",
  "confetti-pop",
  "break-chime",
  "footstep-soft",
  "goat-bleat",
  "goat-gasp",
  "goat-cry",
  "goat-nibble",
  "goat-impact",
  "goat-step",
  "ball-tap",
  "camel-grumble",
  "camel-gasp",
  "camel-cry",
  "camel-chew",
  "camel-spit",
  "camel-wipe",
  "camel-step",
  "cat-mew",
  "cat-yowl",
  "cat-purr",
  "cat-slap",
  "cat-scratch",
  "cat-loaf",
  "cat-step",
  "shiba-bork",
  "shiba-yip",
  "shiba-whine",
  "shiba-dig",
  "shiba-tug",
  "shiba-zoom",
  "shiba-step"
] as const;
export type SfxCueId = (typeof SFX_CUE_IDS)[number];

export const DIALOGUE_INTENT_IDS = [
  "greeting",
  "welcome-back",
  "focus-nudge",
  "break-offer",
  "stretch-reminder",
  "hydrate-reminder",
  "late-night",
  "quiet-hours-soon",
  "signature-start",
  "prank-success",
  "prank-fallback",
  "caught",
  "first-click",
  "second-click",
  "pet-start",
  "pet-thanks",
  "drag-start",
  "drag-release",
  "dismiss",
  "less-of-this",
  "snoozed",
  "manual-summon",
  "meeting-mode",
  "goodbye"
] as const;
export type DialogueIntentId = (typeof DIALOGUE_INTENT_IDS)[number];

export const BEHAVIOR_GROUPS = [
  "fakeDamage",
  "coverContent",
  "cursorPlay",
  "ambient"
] as const;
export type BehaviorGroup = (typeof BEHAVIOR_GROUPS)[number];

export const TRIGGER_TAGS = [
  "focus",
  "random",
  "manual",
  "tutorial",
  "shared"
] as const;
export type TriggerTag = (typeof TRIGGER_TAGS)[number];

export interface LocalizedLabel {
  readonly vi: string;
  readonly en: string;
  readonly ko: string;
  readonly ja: string;
}

export interface PetDefinition {
  readonly id: PetId;
  readonly label: LocalizedLabel;
  readonly species: "goat" | "camel" | "cat" | "dog";
  readonly jerseyNumber: 10 | 7 | null;
  readonly defaultSelected: boolean;
  readonly palette: readonly [string, string, string];
  readonly artboard: string;
  readonly stateMachine: string;
  readonly sfxCues: readonly SfxCueId[];
}

export interface DialogueVariant {
  readonly kind: string;
  readonly sassy: string;
}

export type PetDialogue = Record<DialogueIntentId, DialogueVariant>;
export type LocaleDialogue = Record<PetId, PetDialogue>;
export type DialogueCatalog = Record<Locale, LocaleDialogue>;

export interface DialogueLine {
  readonly id: `${Locale}.${PetId}.${DialogueIntentId}.${Tone}`;
  readonly locale: Locale;
  readonly petId: PetId;
  readonly intent: DialogueIntentId;
  readonly tone: Tone;
  readonly text: string;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface HitRegion {
  readonly pose: string;
  readonly polygon: readonly Point[];
}

export interface DismissPolicy {
  readonly firstClickRelocates: boolean;
  readonly secondClickWindowMs: number;
  readonly longPressMs: number;
}

export interface ActionManifest {
  readonly schemaVersion: typeof CONTENT_SCHEMA_VERSION;
  readonly id: ActionId;
  readonly petIds: readonly PetId[];
  readonly triggerTags: readonly TriggerTag[];
  readonly category: BehaviorGroup;
  readonly durationMs: number;
  readonly riveArtboard: string;
  readonly stateMachine: string;
  readonly inputs: readonly string[];
  readonly markers: readonly string[];
  readonly hitRegions: readonly HitRegion[];
  readonly lineKey: DialogueIntentId;
  readonly sfxCue?: SfxCueId;
  readonly dismissPolicy: DismissPolicy;
}

export interface ActionCatalog {
  readonly schemaVersion: typeof CONTENT_SCHEMA_VERSION;
  readonly actions: readonly ActionManifest[];
}

export interface SfxCueDefinition {
  readonly id: SfxCueId;
  readonly scope: "common" | PetId;
  readonly assetPath: string;
  readonly assetStatus: "pending" | "ready";
}

export interface SfxCatalog {
  readonly schemaVersion: typeof CONTENT_SCHEMA_VERSION;
  readonly cues: readonly SfxCueDefinition[];
}

export interface LocalizationContract {
  readonly schemaVersion: typeof CONTENT_SCHEMA_VERSION;
  readonly keyModel: "semantic-intent";
  readonly rendererKeyTemplate: "dialogue.{petId}.{lineKey}.{tone}";
  readonly petIds: readonly PetId[];
  readonly locales: readonly Locale[];
  readonly tones: readonly Tone[];
  readonly lineKeys: readonly DialogueIntentId[];
}
