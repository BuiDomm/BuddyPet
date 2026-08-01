import { useEffect, useRef, useState } from "react";
import { playDialogueChatter } from "../audio/sfx";
import { playDialogueVoice, stopDialogueVoice } from "../audio/voice";
import { desktopBridge } from "../bridge/desktopBridge";
import type { EpisodePlan } from "../domain/types";
import { dialogueForEpisode, dialogueForReaction } from "./dialogueDirector";

async function playBubbleAudio(plan: EpisodePlan, line: string) {
  const snapshot = await desktopBridge.getSnapshot();
  if (!snapshot.settings.sound || snapshot.runtime.muted) return;
  let voiced = false;
  if (snapshot.settings.behaviorToggles.voice) {
    voiced = await desktopBridge.speakDialogue({
      petId: plan.petId,
      text: line,
      locale: plan.locale,
      volume: snapshot.settings.soundVolume,
    });
    if (!voiced) {
      voiced = playDialogueVoice(plan.petId, line, plan.locale, snapshot.settings.soundVolume);
    }
  }
  if (!voiced && snapshot.settings.behaviorToggles.sfx) {
    playDialogueChatter(plan.petId, line, plan.locale, snapshot.settings.soundVolume);
  }
}

export function BubbleOverlay({ plan }: { plan: EpisodePlan }) {
  const [line, setLine] = useState(() => dialogueForEpisode(plan));
  const entranceLine = useRef(line);
  const [visible, setVisible] = useState(plan.introDurationMs === 0);
  const [reaction, setReaction] = useState<"startled" | "petted" | "dragged" | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    void desktopBridge.sendRendererEvent({ type: "ready", eventId: plan.eventId });
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      setVisible(true);
      void playBubbleAudio(plan, entranceLine.current);
    }, plan.introDurationMs === 0 ? 0 : plan.introDurationMs + 120);

    void desktopBridge.subscribeDirector((event) => {
      if (event.type === "hide" && event.eventId === plan.eventId) {
        setVisible(false);
        stopDialogueVoice();
        void desktopBridge.stopDialogue();
        return;
      }
      if (event.type !== "react" || event.eventId !== plan.eventId) return;
      const nextReaction = event.reaction === "petted"
        ? "petted"
        : event.reaction === "dragReleased"
          ? "dragged"
          : "startled";
      const intent = event.reaction === "petted"
        ? "pet-thanks"
        : event.reaction === "dragReleased"
          ? "drag-release"
          : "first-click";
      const nextLine = dialogueForReaction(plan, intent);
      setReaction(nextReaction);
      setLine(nextLine);
      setVisible(true);
      void playBubbleAudio(plan, nextLine);
    }).then((unlisten) => {
      if (cancelled) unlisten();
      else unsubscribe = unlisten;
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      unsubscribe?.();
      stopDialogueVoice();
      void desktopBridge.stopDialogue();
    };
  }, [plan]);

  return (
    <main className="overlay-root bubble-overlay" aria-live="polite">
      {visible && <div className={`live-bubble ${reaction ? `is-reaction-${reaction}` : ""}`}><span className="live-bubble__eyebrow">BuddyPet</span>{line}</div>}
    </main>
  );
}
