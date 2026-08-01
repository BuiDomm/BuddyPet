import { enDialogue } from "./dialogues/en";
import { jaDialogue } from "./dialogues/ja";
import { koDialogue } from "./dialogues/ko";
import { viDialogue } from "./dialogues/vi";
import { validateDialogueCatalog } from "./schema";
import {
  LOCALES,
  type DialogueCatalog,
  type DialogueIntentId,
  type DialogueLine,
  type Locale,
  type PetId,
  type Tone
} from "./types";

const rawDialogueCatalog = {
  vi: viDialogue,
  en: enDialogue,
  ko: koDialogue,
  ja: jaDialogue
} as const satisfies DialogueCatalog;

// Parse once at module load so malformed bundled copy fails during development and CI,
// before an episode can open any overlay window.
export const DIALOGUES = validateDialogueCatalog(rawDialogueCatalog);

export function resolveLocale(language: string | null | undefined): Locale {
  if (!language) return "en";
  const normalized = language.trim().toLowerCase().split(/[-_]/u)[0];
  return LOCALES.find((locale) => locale === normalized) ?? "en";
}

export function getDialogueLine(
  locale: Locale,
  petId: PetId,
  intent: DialogueIntentId,
  tone: Tone
): DialogueLine {
  return {
    id: `${locale}.${petId}.${intent}.${tone}`,
    locale,
    petId,
    intent,
    tone,
    text: DIALOGUES[locale][petId][intent][tone]
  };
}

export interface SelectDialogueOptions {
  readonly locale: Locale;
  readonly petId: PetId;
  readonly intent: DialogueIntentId;
  readonly tone: Tone;
  /** Chronological line IDs (oldest to newest); only the final ten are considered. */
  readonly recentLineIds?: readonly string[];
}

/**
 * Returns no line rather than repeat the same sentence within the ten-episode guard.
 * Rendering an episode without a bubble is preferable to forcing duplicate copy.
 */
export function selectDialogueLine(options: SelectDialogueOptions): DialogueLine | null {
  const line = getDialogueLine(options.locale, options.petId, options.intent, options.tone);
  const recent = options.recentLineIds?.slice(-10) ?? [];
  return recent.includes(line.id) ? null : line;
}
