import { useCallback, useEffect, useRef, useState } from "react";
import { desktopBridge } from "../bridge/desktopBridge";
import type { EpisodePlan } from "../domain/types";
import { ImmersiveCanvas } from "./ImmersiveCanvas";

function CrackEffect() {
  return <svg className="crack-effect" viewBox="0 0 500 300" aria-hidden="true"><g><path d="M261 122 228 72l18-61M255 112l45-58 41 4M258 123l75 23 42 48M253 130l-18 77-52 64M242 129l-76-7-57-46M261 131l55 66-3 76"/><path d="m228 72-39-12-21-31M300 54l15-31M333 146l58-13 52 24M235 207l27 23-12 53M166 122l-27 42-51 10M316 197l48 15 18 39"/></g><circle cx="253" cy="125" r="17"/></svg>;
}

function ScratchEffect() {
  return <div className="scratch-effect" aria-hidden="true"><i/><i/><i/><span/><span/><span/></div>;
}

function PaperEffect() {
  return <div className="paper-effect" aria-hidden="true"><div className="paper-piece paper-piece--one"/><div className="paper-piece paper-piece--two"/><div className="paper-piece paper-piece--three"/><div className="paper-bite"><i/><i/><i/></div></div>;
}

export function EffectOverlay({ plan }: { plan: EpisodePlan }) {
  const [immersiveState, setImmersiveState] = useState<"loading" | "ready" | "fallback">(plan.captureRect ? "loading" : "fallback");
  const [cleared, setCleared] = useState(false);
  const captureNotified = useRef<string | null>(null);
  const notifyCaptureComplete = useCallback((state: "ready" | "fallback") => {
    setImmersiveState(state);
    if (captureNotified.current !== plan.eventId) {
      captureNotified.current = plan.eventId;
      void desktopBridge.sendRendererEvent({ type: "marker", eventId: plan.eventId, marker: "captureReady" });
    }
  }, [plan.eventId]);
  const immersiveReady = useCallback(() => notifyCaptureComplete("ready"), [notifyCaptureComplete]);
  const immersiveFallback = useCallback(() => notifyCaptureComplete("fallback"), [notifyCaptureComplete]);

  useEffect(() => {
    void desktopBridge.sendRendererEvent({ type: "ready", eventId: plan.eventId });
    const impact = window.setTimeout(() => void desktopBridge.sendRendererEvent({ type: "marker", eventId: plan.eventId, marker: "impact" }), 380);
    const clear = window.setTimeout(() => {
      setCleared(true);
      void desktopBridge.sendRendererEvent({ type: "marker", eventId: plan.eventId, marker: "effect-clear" });
    }, 2_350);
    return () => { window.clearTimeout(impact); window.clearTimeout(clear); };
  }, [plan.eventId]);

  const scratch = plan.actionId.includes("scratch") || plan.actionId.includes("dig");
  const crack = plan.actionId.includes("headbutt") || plan.actionId.includes("slap") || plan.actionId.includes("zoomies");
  if (cleared) return null;
  return (
    <main className={`overlay-root effect-overlay effect-overlay--${plan.actionId} ${immersiveState === "ready" ? "has-immersive-frame" : ""}`}>
      {plan.captureRect && <ImmersiveCanvas plan={plan} onReady={immersiveReady} onFallback={immersiveFallback} />}
      <div className="effect-glint" aria-hidden="true" />
      <div className="cartoon-effect" aria-hidden="true">{crack ? <CrackEffect /> : scratch ? <ScratchEffect /> : <PaperEffect />}</div>
    </main>
  );
}
