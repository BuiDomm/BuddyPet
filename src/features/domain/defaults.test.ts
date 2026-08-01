import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, mergeSettings, minutesToTime, timeToMinutes } from "./defaults";

describe("BuddyPet settings defaults", () => {
  it("keeps nested defaults when loading a partial persisted document", () => {
    const result = mergeSettings({
      locale: "ja",
      quietHours: { enabled: false, startMinute: 60, endMinute: 120 },
      behaviorToggles: { fakeDamage: false, coverContent: true, cursorPlay: true, sfx: false },
    });

    expect(result.locale).toBe("ja");
    expect(result.quietHours).toEqual({ enabled: false, startMinute: 60, endMinute: 120 });
    expect(result.behaviorToggles.fakeDamage).toBe(false);
    expect(DEFAULT_SETTINGS.locale).toBe("vi");
  });

  it("converts native minute values to and from time inputs", () => {
    expect(minutesToTime(22 * 60)).toBe("22:00");
    expect(minutesToTime(8 * 60 + 5)).toBe("08:05");
    expect(timeToMinutes("23:45")).toBe(1425);
    expect(timeToMinutes("99:99")).toBe(1439);
  });
});
