import { useEffect } from "react";
import { desktopBridge } from "../bridge/desktopBridge";
import type { EpisodePlan } from "../domain/types";
import { dialogueForEpisode } from "./dialogueDirector";

export function BubbleOverlay({ plan }: { plan: EpisodePlan }) {
  const line = dialogueForEpisode(plan);

  useEffect(() => {
    void desktopBridge.sendRendererEvent({ type: "ready", eventId: plan.eventId });
  }, [plan.eventId]);

  return (
    <main className="overlay-root bubble-overlay" aria-live="polite">
      <div className="live-bubble"><span className="live-bubble__eyebrow">BuddyPet</span>{line}</div>
    </main>
  );
}
