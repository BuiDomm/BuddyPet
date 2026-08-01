import type { BuddyId } from "../domain/types";

const VOICES: Record<BuddyId, readonly [number, number, OscillatorType]> = {
  goat10: [510, 690, "triangle"],
  camel7: [210, 155, "sawtooth"],
  memeCat: [720, 510, "sine"],
  shiba: [430, 860, "square"],
};

/**
 * Short, synthesized placeholder SFX. It is generated locally, contains no
 * speech, performs no recording and leaves no decoded audio buffer behind.
 */
export function playBuddySfx(buddyId: BuddyId, volumePercent = 70, startled = false): void {
  const AudioContextClass = globalThis.AudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass({ latencyHint: "interactive" });
  const now = context.currentTime;
  const gain = context.createGain();
  const [firstFrequency, secondFrequency, waveform] = VOICES[buddyId];
  const peak = Math.max(0, Math.min(1, volumePercent / 100)) * 0.16;

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), now + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + (startled ? 0.38 : 0.52));
  gain.connect(context.destination);

  const oscillator = context.createOscillator();
  oscillator.type = waveform;
  oscillator.frequency.setValueAtTime(startled ? secondFrequency * 1.2 : firstFrequency, now);
  oscillator.frequency.exponentialRampToValueAtTime(
    Math.max(45, startled ? firstFrequency * 0.78 : secondFrequency),
    now + (startled ? 0.24 : 0.36),
  );
  oscillator.connect(gain);
  oscillator.start(now);
  oscillator.stop(now + (startled ? 0.4 : 0.55));
  oscillator.addEventListener("ended", () => void context.close(), { once: true });
}

