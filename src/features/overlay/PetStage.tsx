import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { BuddyCharacter, type BuddyMood } from "../../components/BuddyCharacter";
import { Icon } from "../../components/Icon";
import { playActionSfx, playBuddySfx, soundKindForMarker } from "../audio/sfx";
import { desktopBridge } from "../bridge/desktopBridge";
import { minutesUntilLocalTomorrow } from "../domain/time";
import type { EpisodePlan } from "../domain/types";

export function PetStage({ plan }: { plan: EpisodePlan }) {
  const { t } = useTranslation();
  const [mood, setMood] = useState<BuddyMood>("enter");
  const [phase, setPhase] = useState<"enter" | "flourish" | "prank" | "reaction" | "exit">("enter");
  const [clickCount, setClickCount] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [menuOpen, setMenuOpen] = useState(false);
  const [reactionFx, setReactionFx] = useState<{ kind: "startled" | "petted" | "dropped"; id: number } | null>(null);
  const pointer = useRef<{ id: number; x: number; y: number; dragging: boolean } | null>(null);
  const holdTimer = useRef<number | null>(null);
  const reactionTimers = useRef<number[]>([]);
  const lastClick = useRef(0);
  const petted = useRef(false);
  const interacted = useRef(false);
  const sound = useRef({ enabled: false, volume: 70 });
  const rigReady = useRef(false);

  useEffect(() => {
    void desktopBridge.getSnapshot().then((snapshot) => {
      sound.current = {
        enabled: snapshot.settings.sound && snapshot.settings.behaviorToggles.sfx,
        volume: snapshot.settings.soundVolume,
      };
    });
    void desktopBridge.sendRendererEvent({ type: "ready", eventId: plan.eventId });
    const footstepTimer = window.setTimeout(() => {
      if (sound.current.enabled && !rigReady.current) playBuddySfx(plan.petId, sound.current.volume, "footstep");
    }, Math.min(180, plan.introDurationMs / 3));
    const flourishTimer = window.setTimeout(() => {
      if (!interacted.current) {
        setPhase("flourish");
        setMood("happy");
        if (sound.current.enabled && !rigReady.current) {
          playBuddySfx(plan.petId, sound.current.volume, "flourish");
          playBuddySfx(plan.petId, sound.current.volume, "species");
        }
      }
      void desktopBridge.sendRendererEvent({ type: "poseChanged", eventId: plan.eventId, pose: "enter" });
    }, Math.round(plan.introDurationMs * 0.62));
    const prankTimer = window.setTimeout(() => {
      if (!interacted.current) {
        setPhase("prank");
        setMood("prank");
        if (sound.current.enabled && !rigReady.current) playActionSfx(plan.petId, plan.actionId, sound.current.volume);
      }
      void desktopBridge.sendRendererEvent({ type: "marker", eventId: plan.eventId, marker: "entranceComplete" });
      void desktopBridge.sendRendererEvent({ type: "poseChanged", eventId: plan.eventId, pose: "prank" });
    }, plan.introDurationMs);
    const episodeTimer = window.setTimeout(() => {
      setMood("exit");
      setPhase("exit");
      void desktopBridge.sendRendererEvent({ type: "completed", eventId: plan.eventId });
    }, 11_500);
    return () => {
      window.clearTimeout(footstepTimer);
      window.clearTimeout(flourishTimer);
      window.clearTimeout(prankTimer);
      window.clearTimeout(episodeTimer);
      reactionTimers.current.forEach((timer) => window.clearTimeout(timer));
      void desktopBridge.setPetMenuOpen(false);
    };
  }, [plan.actionId, plan.eventId, plan.introDurationMs, plan.petId]);

  const clearHold = () => {
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  const pointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY, dragging: false };
    petted.current = false;
    holdTimer.current = window.setTimeout(() => {
      interacted.current = true;
      petted.current = true;
      setPhase("reaction");
      setMood("petted");
      setReactionFx({ kind: "petted", id: Date.now() });
      if (sound.current.enabled) playBuddySfx(plan.petId, sound.current.volume, "petted");
      void desktopBridge.sendRendererEvent({ type: "petted", eventId: plan.eventId });
    }, 700);
  };

  const pointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const active = pointer.current;
    if (!active || active.id !== event.pointerId) return;
    const dx = event.clientX - active.x;
    const dy = event.clientY - active.y;
    if (!active.dragging && Math.hypot(dx, dy) > 7) {
      interacted.current = true;
      active.dragging = true;
      clearHold();
      setPhase("reaction");
      setMood("dragging");
    }
    if (active.dragging) setPosition((current) => ({ x: current.x + event.movementX, y: current.y + event.movementY }));
  };

  const pointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const active = pointer.current;
    clearHold();
    pointer.current = null;
    if (!active || active.id !== event.pointerId) return;
    if (active.dragging) {
      setMood("happy");
      setReactionFx({ kind: "dropped", id: Date.now() });
      if (sound.current.enabled) playBuddySfx(plan.petId, sound.current.volume, "drop");
      const droppedPosition = position;
      setPosition({ x: 0, y: 0 });
      void desktopBridge.sendRendererEvent({
        type: "dragged",
        eventId: plan.eventId,
        anchor: {
          x: plan.anchorRect.x + droppedPosition.x,
          y: plan.anchorRect.y + droppedPosition.y,
          width: plan.anchorRect.width,
          height: plan.anchorRect.height,
        },
      });
      return;
    }
    if (petted.current) return;
    const now = Date.now();
    interacted.current = true;
    setPhase("reaction");
    const nextCount = now - lastClick.current <= 8_000 ? clickCount + 1 : 1;
    lastClick.current = now;
    setClickCount(nextCount);
    setReactionFx({ kind: "startled", id: now });
    if (sound.current.enabled) playBuddySfx(plan.petId, sound.current.volume, nextCount >= 2 ? "exit" : "startled");
    void desktopBridge.sendRendererEvent({ type: "clicked", eventId: plan.eventId });
    if (nextCount >= 2) {
      reactionTimers.current.forEach((timer) => window.clearTimeout(timer));
      reactionTimers.current = [];
      setMood("exit");
      setPhase("exit");
    } else {
      setMood("startled");
      window.setTimeout(() => setMood("happy"), 720);
      reactionTimers.current.push(
        window.setTimeout(() => { setMood("exit"); setPhase("exit"); }, 4_300),
        window.setTimeout(() => {
          void desktopBridge.sendRendererEvent({ type: "completed", eventId: plan.eventId });
        }, 4_800),
      );
    }
  };

  const action = (kind: "hide" | "lessOfThis" | "snooze", durationMinutes?: number) => {
    setMenuOpen(false);
    void desktopBridge.setPetMenuOpen(false);
    if (kind === "hide") { setMood("exit"); setPhase("exit"); }
    void desktopBridge.performAction({ action: kind, durationMinutes });
  };

  const closeMenu = () => {
    setMenuOpen(false);
    void desktopBridge.setPetMenuOpen(false);
  };

  const onRigMarker = (marker: string) => {
    const kind = soundKindForMarker(marker);
    if (kind && sound.current.enabled) playBuddySfx(plan.petId, sound.current.volume, kind);
    void desktopBridge.sendRendererEvent({ type: "marker", eventId: plan.eventId, marker });
  };

  return (
    <main className={`overlay-root pet-stage intro-${plan.petId} phase-${phase} ${plan.reduceMotion ? "is-reduced-motion" : ""} ${plan.powerSaver ? "is-power-saver" : ""}`} aria-label={t("overlay.stage", { defaultValue: "BuddyPet desktop companion" })}>
      <button
        type="button"
        className="pet-hit-target"
        aria-label={t("overlay.interact", { defaultValue: "Interact with {{pet}}", pet: plan.petId })}
        style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={() => { clearHold(); pointer.current = null; }}
        onContextMenu={(event) => {
          event.preventDefault();
          setMenuOpen(true);
          void desktopBridge.setPetMenuOpen(true);
        }}
      >
        <BuddyCharacter buddyId={plan.petId} size="stage" mood={mood} actionId={plan.actionId} reduceMotion={plan.reduceMotion} className={`action-${plan.actionId}`} onRigReady={(ready) => { rigReady.current = ready; }} onMarker={onRigMarker} />
      </button>
      {reactionFx && (
        <div className={`pet-reaction-fx pet-reaction-fx--${reactionFx.kind}`} key={reactionFx.id} aria-hidden="true">
          <strong>{reactionFx.kind === "startled" ? "!" : reactionFx.kind === "petted" ? "♥" : "✦"}</strong>
          <i/><i/><i/>
        </div>
      )}
      {menuOpen && (
        <>
          <button type="button" className="pet-menu-backdrop" aria-label={t("overlay.closeMenu", { defaultValue: "Close Buddy menu" })} onClick={closeMenu} />
          <div className="pet-context-menu" role="menu">
          <button role="menuitem" type="button" onClick={() => action("hide")}><Icon name="eyeOff"/>{t("overlay.hide", { defaultValue: "Hide now" })}</button>
          <button role="menuitem" type="button" onClick={() => action("lessOfThis")}><Icon name="minus"/>{t("overlay.less", { defaultValue: "Less of this" })}</button>
          <span />
          {[15, 30, 60].map((minutes) => <button role="menuitem" type="button" onClick={() => action("snooze", minutes)} key={minutes}><Icon name="clock"/>{t("overlay.snooze", { defaultValue: "Snooze {{minutes}} min", minutes })}</button>)}
          <button role="menuitem" type="button" onClick={() => action("snooze", minutesUntilLocalTomorrow())}><Icon name="moon"/>{t("snooze.today", { defaultValue: "Snooze today" })}</button>
          </div>
        </>
      )}
    </main>
  );
}
