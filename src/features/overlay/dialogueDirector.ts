import { DIALOGUES } from "../../content/dialogue";
import type { DialogueIntentId } from "../../content/types";
import type { EpisodePlan } from "../domain/types";

const recentLineIds: string[] = [];
const episodeLines = new Map<string, string>();

const INTENTS: Record<EpisodePlan["trigger"], readonly DialogueIntentId[]> = {
  focusNudge: ["focus-nudge", "break-offer", "stretch-reminder", "hydrate-reminder"],
  random: ["signature-start", "prank-success", "greeting", "break-offer", "welcome-back"],
  manual: ["manual-summon", "greeting", "welcome-back"],
  tutorial: ["greeting", "welcome-back", "signature-start"],
};

function actionIntent(actionId: string): DialogueIntentId | null {
  if (actionId.includes("break-ticket")) return "break-offer";
  if (actionId.includes("corner-nap")) return "late-night";
  if (actionId.includes("sticky-note")) return "focus-nudge";
  if (actionId.includes("confetti")) return "prank-success";
  return null;
}

/** Selects deterministic, semantic copy while retaining a RAM-only ten-line guard. */
export function dialogueForEpisode(plan: EpisodePlan): string {
  if (plan.line) return plan.line;
  const cached = episodeLines.get(plan.eventId);
  if (cached) return cached;

  const preferred = actionIntent(plan.actionId);
  const pool = preferred ? [preferred, ...INTENTS[plan.trigger]] : [...INTENTS[plan.trigger]];
  const candidates = [...new Set(pool)].filter((intent) => {
    const id = `${plan.locale}.${plan.petId}.${intent}.${plan.tone}`;
    return !recentLineIds.includes(id);
  });
  const usable = candidates.length ? candidates : [...new Set(pool)];
  const index = usable.length ? Math.abs(Math.trunc(plan.seed)) % usable.length : 0;
  const intent = usable[index] ?? "greeting";
  const id = `${plan.locale}.${plan.petId}.${intent}.${plan.tone}`;
  const line = DIALOGUES[plan.locale][plan.petId][intent][plan.tone];

  recentLineIds.push(id);
  if (recentLineIds.length > 10) recentLineIds.shift();
  episodeLines.set(plan.eventId, line);
  if (episodeLines.size > 16) {
    const oldest = episodeLines.keys().next().value;
    if (oldest) episodeLines.delete(oldest);
  }
  return line;
}

