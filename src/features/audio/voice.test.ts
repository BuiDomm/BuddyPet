import { afterEach, describe, expect, it, vi } from "vitest";
import { playDialogueVoice, stopDialogueVoice } from "./voice";

class FakeUtterance {
  lang = "";
  pitch = 1;
  rate = 1;
  volume = 1;
  voice: SpeechSynthesisVoice | null = null;

  constructor(readonly text: string) {}
}

describe("local dialogue voice", () => {
  const originalSynthesis = globalThis.speechSynthesis;
  const originalUtterance = globalThis.SpeechSynthesisUtterance;

  afterEach(() => {
    Object.defineProperty(globalThis, "speechSynthesis", { configurable: true, value: originalSynthesis });
    Object.defineProperty(globalThis, "SpeechSynthesisUtterance", { configurable: true, value: originalUtterance });
  });

  it("selects an installed voice matching Korean and applies the pet style", () => {
    const speak = vi.fn();
    const cancel = vi.fn();
    const koreanVoice = { lang: "ko-KR" } as SpeechSynthesisVoice;
    Object.defineProperty(globalThis, "speechSynthesis", {
      configurable: true,
      value: { cancel, getVoices: () => [koreanVoice], speak },
    });
    Object.defineProperty(globalThis, "SpeechSynthesisUtterance", { configurable: true, value: FakeUtterance });

    expect(playDialogueVoice("camel7", "잠깐 쉬어도 괜찮아요.", "ko", 80)).toBe(true);
    const utterance = speak.mock.calls[0]?.[0] as FakeUtterance;
    expect(utterance.lang).toBe("ko-KR");
    expect(utterance.voice).toBe(koreanVoice);
    expect(utterance.pitch).toBe(0.94);
    expect(utterance.volume).toBe(0.8);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("returns false when the platform has no speech engine", () => {
    Object.defineProperty(globalThis, "speechSynthesis", { configurable: true, value: undefined });
    Object.defineProperty(globalThis, "SpeechSynthesisUtterance", { configurable: true, value: undefined });
    expect(playDialogueVoice("goat10", "Xin chào", "vi")).toBe(false);
    expect(() => stopDialogueVoice()).not.toThrow();
  });
});
