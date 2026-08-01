import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { BuddyCharacter, type BuddyMood } from "../../components/BuddyCharacter";
import { Icon } from "../../components/Icon";
import { playBuddySfx } from "../audio/sfx";
import { desktopBridge } from "../bridge/desktopBridge";
import type { EpisodePlan } from "../domain/types";

export function PetStage({ plan }: { plan: EpisodePlan }) {
  const { t } = useTranslation();
  const [mood, setMood] = useState<BuddyMood>("enter");
  const [clickCount, setClickCount] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [menuOpen, setMenuOpen] = useState(false);
  const pointer = useRef<{ id: number; x: number; y: number; dragging: boolean } | null>(null);
  const holdTimer = useRef<number | null>(null);
  const lastClick = useRef(0);
  const petted = useRef(false);
  const sound = useRef({ enabled: false, volume: 70 });

  useEffect(() => {
    void desktopBridge.getSnapshot().then((snapshot) => {
      sound.current = {
        enabled: snapshot.settings.sound && snapshot.settings.behaviorToggles.sfx,
        volume: snapshot.settings.soundVolume,
      };
    });
    void desktopBridge.sendRendererEvent({ type: "ready", eventId: plan.eventId });
    const enterTimer = window.setTimeout(() => {
      setMood("prank");
      void desktopBridge.sendRendererEvent({ type: "poseChanged", eventId: plan.eventId, pose: "prank" });
    }, 520);
    const episodeTimer = window.setTimeout(() => {
      setMood("exit");
      void desktopBridge.sendRendererEvent({ type: "completed", eventId: plan.eventId });
    }, 11_500);
    return () => {
      window.clearTimeout(enterTimer);
      window.clearTimeout(episodeTimer);
      void desktopBridge.setPetMenuOpen(false);
    };
  }, [plan.eventId]);

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
      petted.current = true;
      setMood("petted");
      void desktopBridge.sendRendererEvent({ type: "petted", eventId: plan.eventId });
    }, 700);
  };

  const pointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const active = pointer.current;
    if (!active || active.id !== event.pointerId) return;
    const dx = event.clientX - active.x;
    const dy = event.clientY - active.y;
    if (!active.dragging && Math.hypot(dx, dy) > 7) {
      active.dragging = true;
      clearHold();
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
      void desktopBridge.sendRendererEvent({
        type: "dragged",
        eventId: plan.eventId,
        anchor: {
          x: plan.anchorRect.x + position.x,
          y: plan.anchorRect.y + position.y,
          width: plan.anchorRect.width,
          height: plan.anchorRect.height,
        },
      });
      return;
    }
    if (petted.current) return;
    const now = Date.now();
    const nextCount = now - lastClick.current <= 8_000 ? clickCount + 1 : 1;
    lastClick.current = now;
    setClickCount(nextCount);
    if (sound.current.enabled) playBuddySfx(plan.petId, sound.current.volume, true);
    void desktopBridge.sendRendererEvent({ type: "clicked", eventId: plan.eventId });
    if (nextCount >= 2) {
      setMood("exit");
    } else {
      setMood("startled");
      window.setTimeout(() => setMood("happy"), 720);
    }
  };

  const action = (kind: "hide" | "lessOfThis" | "snooze", durationMinutes?: number) => {
    setMenuOpen(false);
    void desktopBridge.setPetMenuOpen(false);
    if (kind === "hide") setMood("exit");
    void desktopBridge.performAction({ action: kind, durationMinutes });
  };

  const closeMenu = () => {
    setMenuOpen(false);
    void desktopBridge.setPetMenuOpen(false);
  };

  return (
    <main className="overlay-root pet-stage" aria-label={t("overlay.stage", { defaultValue: "BuddyPet desktop companion" })}>
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
        <BuddyCharacter buddyId={plan.petId} size="stage" mood={mood} />
      </button>
      {menuOpen && (
        <>
          <button type="button" className="pet-menu-backdrop" aria-label={t("overlay.closeMenu", { defaultValue: "Close Buddy menu" })} onClick={closeMenu} />
          <div className="pet-context-menu" role="menu">
          <button role="menuitem" type="button" onClick={() => action("hide")}><Icon name="eyeOff"/>{t("overlay.hide", { defaultValue: "Hide now" })}</button>
          <button role="menuitem" type="button" onClick={() => action("lessOfThis")}><Icon name="minus"/>{t("overlay.less", { defaultValue: "Less of this" })}</button>
          <span />
          {[15, 30, 60].map((minutes) => <button role="menuitem" type="button" onClick={() => action("snooze", minutes)} key={minutes}><Icon name="clock"/>{t("overlay.snooze", { defaultValue: "Snooze {{minutes}} min", minutes })}</button>)}
          </div>
        </>
      )}
    </main>
  );
}
