import { describe, expect, it } from "vitest";
import { minutesUntilLocalTomorrow } from "./time";

describe("minutesUntilLocalTomorrow", () => {
  it("targets the next local midnight instead of a fixed eight-hour pause", () => {
    expect(minutesUntilLocalTomorrow(new Date(2026, 7, 1, 22, 30, 0))).toBe(90);
    expect(minutesUntilLocalTomorrow(new Date(2026, 7, 1, 0, 0, 0))).toBe(1_440);
  });
});
