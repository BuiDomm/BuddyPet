import { beforeEach, describe, expect, it } from "vitest";
import { desktopBridge } from "./desktopBridge";

describe("desktopBridge browser fallback", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  it("returns a complete settings snapshot without Tauri", async () => {
    const snapshot = await desktopBridge.getSnapshot();
    expect(snapshot.settings.schemaVersion).toBe(1);
    expect(snapshot.settings.selectedPets).toEqual(["memeCat"]);
    expect(snapshot.settings.quietHours.startMinute).toBe(1320);
  });

  it("persists settings and runtime actions in the browser mock", async () => {
    const initial = await desktopBridge.getSnapshot();
    const saved = await desktopBridge.updateSettings({ ...initial.settings, locale: "ko", sound: true });
    expect(saved.settings.locale).toBe("ko");

    const paused = await desktopBridge.performAction({ action: "pause" });
    expect(paused.runtime.paused).toBe(true);
    const snoozed = await desktopBridge.performAction({ action: "snooze", durationMinutes: 15 });
    expect(snoozed.runtime.snoozedUntil).not.toBeNull();
  });

  it("uses query parameters to preview overlay windows", async () => {
    window.history.replaceState(null, "", "/?window=effect&pet=shiba&action=dig");
    expect(await desktopBridge.getWindowRole()).toBe("effect");
    const plan = await desktopBridge.getOverlayPayload();
    expect(plan).toMatchObject({ petId: "shiba", actionId: "dig", trigger: "manual" });
  });

  it("uses Meme Cat and its signature action for a default browser preview", async () => {
    const plan = await desktopBridge.getOverlayPayload();
    expect(plan).toMatchObject({ petId: "memeCat", actionId: "slap" });
  });

  it("selects a different offline voice package for the active locale", async () => {
    const vietnamese = await desktopBridge.getVoicePackStatus("vi");
    const english = await desktopBridge.getVoicePackStatus("en");
    const korean = await desktopBridge.getVoicePackStatus("ko");
    const japanese = await desktopBridge.getVoicePackStatus("ja");

    expect(vietnamese).toMatchObject({ locale: "vi", engine: "Piper VITS", id: "piper-vi-vais1000-medium" });
    expect(english).toMatchObject({ locale: "en", engine: "Piper VITS", id: "piper-en-ljspeech-medium" });
    expect(korean.id).toBe(japanese.id);
    expect(korean.engine).toBe("Supertonic 3");
    expect(vietnamese.totalBytes).toBeLessThan(korean.totalBytes);
  });
});
