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
    expect(snapshot.settings.selectedPets).toEqual(["goat10"]);
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
});
