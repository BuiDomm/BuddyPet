import { describe, expect, it } from "vitest";
import type { EpisodePlan } from "../domain/types";
import { dialogueForEpisode } from "./dialogueDirector";

const basePlan: EpisodePlan = {
  eventId: "shuffle-0",
  trigger: "manual",
  petId: "shiba",
  actionId: "shiba-zoomies",
  lineKey: "signature-start",
  monitorId: "primary",
  anchorRect: { x: 0, y: 0, width: 280, height: 220 },
  motionPath: [],
  introDurationMs: 2_000,
  captureRect: null,
  locale: "ja",
  tone: "kind",
  seed: 7,
  reduceMotion: false,
  powerSaver: false,
};

describe("dialogue shuffle bag", () => {
  it("does not repeat an appearance line until the pool is exhausted", () => {
    const lines = Array.from({ length: 10 }, (_, index) => dialogueForEpisode({
      ...basePlan,
      eventId: `shuffle-${index}`,
      seed: 7,
    }));
    expect(new Set(lines)).toHaveLength(10);

    const next = dialogueForEpisode({ ...basePlan, eventId: "shuffle-next", seed: 7 });
    expect(next).not.toBe(lines.at(-1));
  });
});
