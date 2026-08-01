import { describe, expect, it } from "vitest";
import { soundKindForAction, soundKindForMarker } from "./sfx";

describe("procedural SFX routing", () => {
  it.each([
    ["camel-spit-wipe", "splash"],
    ["cat-image-scratch", "scratch"],
    ["shiba-zoomies", "skid"],
    ["shared-break-ticket", "chime"],
    ["goat-nibble-corner", "paper"],
    ["goat-headbutt-crack", "impact"],
  ] as const)("routes %s to %s", (actionId, expected) => {
    expect(soundKindForAction(actionId)).toBe(expected);
  });

  it("routes animator markers to frame-accurate cues", () => {
    expect(soundKindForMarker("footstepLeft")).toBe("footstep");
    expect(soundKindForMarker("cloth_rustle")).toBe("rustle");
    expect(soundKindForMarker("victoryCall")).toBe("victory");
    expect(soundKindForMarker("unknownMarker")).toBeNull();
  });
});
