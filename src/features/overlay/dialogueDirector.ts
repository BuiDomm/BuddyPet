import { DIALOGUES } from "../../content/dialogue";
import { DIALOGUE_INTENT_IDS, type DialogueIntentId } from "../../content/types";
import type { EpisodePlan } from "../domain/types";

const episodeLines = new Map<string, string>();
const usedAppearanceIntents = new Map<string, Set<DialogueIntentId>>();
const lastAppearanceIntent = new Map<string, DialogueIntentId>();

const INTENTS: Record<EpisodePlan["trigger"], readonly DialogueIntentId[]> = {
  focusNudge: ["focus-nudge", "break-offer", "stretch-reminder", "hydrate-reminder", "signature-start", "prank-success", "caught", "welcome-back"],
  random: ["signature-start", "prank-success", "greeting", "break-offer", "welcome-back", "stretch-reminder", "hydrate-reminder", "caught", "prank-fallback", "manual-summon"],
  manual: ["manual-summon", "greeting", "welcome-back", "signature-start", "prank-success", "caught", "break-offer", "stretch-reminder", "hydrate-reminder", "prank-fallback"],
  tutorial: ["greeting", "welcome-back", "signature-start", "manual-summon", "prank-success", "caught", "break-offer", "stretch-reminder", "hydrate-reminder", "prank-fallback"],
};

function actionIntent(actionId: string): DialogueIntentId | null {
  if (actionId.includes("break-ticket")) return "break-offer";
  if (actionId.includes("corner-nap")) return "late-night";
  if (actionId.includes("sticky-note")) return "focus-nudge";
  if (actionId.includes("confetti")) return "prank-success";
  return null;
}

function manifestIntent(lineKey: string): DialogueIntentId | null {
  return DIALOGUE_INTENT_IDS.includes(lineKey as DialogueIntentId)
    ? lineKey as DialogueIntentId
    : null;
}

/**
 * Selects from a RAM-only shuffle bag. An appearance does not repeat a line
 * until every suitable line for that Buddy/locale/tone has been used.
 */
export function dialogueForEpisode(plan: EpisodePlan): string {
  if (plan.line) return plan.line;
  const cached = episodeLines.get(plan.eventId);
  if (cached) return cached;

  const preferred = manifestIntent(plan.lineKey) ?? actionIntent(plan.actionId);
  const key = `${plan.locale}.${plan.petId}.${plan.tone}`;
  const used = usedAppearanceIntents.get(key) ?? new Set<DialogueIntentId>();
  usedAppearanceIntents.set(key, used);
  const pool = [...new Set(INTENTS[plan.trigger])];
  let usable = pool.filter((intent) => !used.has(intent));
  if (usable.length === 0) {
    used.clear();
    const previous = lastAppearanceIntent.get(key);
    usable = pool.filter((intent) => intent !== previous);
    if (usable.length === 0) usable = pool;
  }
  const index = usable.length ? Math.abs(Math.trunc(plan.seed)) % usable.length : 0;
  const intent = preferred && usable.includes(preferred)
    ? preferred
    : usable[index] ?? preferred ?? "greeting";
  const line = DIALOGUES[plan.locale][plan.petId][intent][plan.tone];

  used.add(intent);
  lastAppearanceIntent.set(key, intent);
  episodeLines.set(plan.eventId, line);
  if (episodeLines.size > 16) {
    const oldest = episodeLines.keys().next().value;
    if (oldest) episodeLines.delete(oldest);
  }
  return line;
}

export function dialogueForReaction(
  plan: EpisodePlan,
  intent: "first-click" | "pet-thanks" | "drag-release",
): string {
  return DIALOGUES[plan.locale][plan.petId][intent][plan.tone];
}
