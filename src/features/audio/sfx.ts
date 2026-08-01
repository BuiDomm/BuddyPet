import type { BuddyId, Locale } from "../domain/types";

export type BuddySoundKind = "greeting" | "species" | "footstep" | "flourish" | "startled" | "petted" | "drop" | "exit" | "impact" | "paper" | "rustle" | "scratch" | "splash" | "speed" | "skid" | "whoosh" | "victory" | "chime";

const VOICES: Record<BuddyId, readonly [number, number, OscillatorType]> = {
  goat10: [510, 690, "triangle"],
  camel7: [210, 155, "sawtooth"],
  memeCat: [720, 510, "sine"],
  shiba: [430, 860, "square"],
};

const ACTION_SOUNDS: readonly [string, BuddySoundKind][] = [
  ["spit", "splash"],
  ["splash", "splash"],
  ["stretch", "victory"],
  ["neck-stretch", "whoosh"],
  ["scratch", "scratch"],
  ["dig", "scratch"],
  ["zoomies", "skid"],
  ["dribble", "skid"],
  ["confetti", "chime"],
  ["break-ticket", "chime"],
  ["sticky-note", "paper"],
  ["nibble", "paper"],
  ["chew", "paper"],
  ["tug", "paper"],
];

export function soundKindForAction(actionId: string): BuddySoundKind {
  return ACTION_SOUNDS.find(([fragment]) => actionId.includes(fragment))?.[1] ?? "impact";
}

export function soundKindForMarker(marker: string): BuddySoundKind | null {
  const normalized = marker.toLowerCase().replaceAll("_", "-");
  if (normalized.includes("footstep") || normalized === "step") return "footstep";
  if (normalized.includes("rustle") || normalized.includes("cloth")) return "rustle";
  if (normalized.includes("bite") || normalized.includes("impact") || normalized.includes("land")) return "impact";
  if (normalized.includes("skid") || normalized.includes("slide")) return "skid";
  if (normalized.includes("whoosh") || normalized.includes("jump")) return "whoosh";
  if (normalized.includes("victory") || normalized.includes("celebrate")) return "victory";
  if (normalized.includes("voice") || normalized.includes("species") || normalized.includes("call")) return "species";
  if (normalized.includes("release") || normalized.includes("drop")) return "drop";
  return null;
}

function tone(
  context: AudioContext,
  destination: AudioNode,
  waveform: OscillatorType,
  from: number,
  to: number,
  startsAt: number,
  duration: number,
) {
  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  oscillator.type = waveform;
  oscillator.frequency.setValueAtTime(Math.max(45, from), startsAt);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(45, to), startsAt + duration);
  envelope.gain.setValueAtTime(0.0001, startsAt);
  envelope.gain.exponentialRampToValueAtTime(1, startsAt + Math.min(0.018, duration / 4));
  envelope.gain.exponentialRampToValueAtTime(0.0001, startsAt + duration);
  oscillator.connect(envelope).connect(destination);
  oscillator.start(startsAt);
  oscillator.stop(startsAt + duration + 0.01);
}

function noise(context: AudioContext, destination: AudioNode, startsAt: number, duration: number, frequency: number) {
  const frames = Math.max(1, Math.floor(context.sampleRate * duration));
  const buffer = context.createBuffer(1, frames, context.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < channel.length; index += 1) {
    channel[index] = (Math.random() * 2 - 1) * (1 - index / channel.length);
  }
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const envelope = context.createGain();
  source.buffer = buffer;
  filter.type = "bandpass";
  filter.frequency.value = frequency;
  filter.Q.value = 0.8;
  envelope.gain.setValueAtTime(0.0001, startsAt);
  envelope.gain.exponentialRampToValueAtTime(0.8, startsAt + 0.012);
  envelope.gain.exponentialRampToValueAtTime(0.0001, startsAt + duration);
  source.connect(filter).connect(envelope).connect(destination);
  source.start(startsAt);
  source.stop(startsAt + duration + 0.01);
}

/**
 * Plays an original, procedural, speech-free cue. No microphone, network or
 * persistent decoded audio buffer is involved; every short graph is released.
 */
export function playBuddySfx(buddyId: BuddyId, volumePercent = 70, kind: BuddySoundKind = "greeting"): void {
  const AudioContextClass = globalThis.AudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass({ latencyHint: "interactive" });
  const now = context.currentTime;
  const master = context.createGain();
  const [low, high, waveform] = VOICES[buddyId];
  const peak = Math.max(0, Math.min(1, volumePercent / 100)) * 0.13;
  master.gain.setValueAtTime(peak, now);
  master.connect(context.destination);
  void context.resume();

  switch (kind) {
    case "species":
      if (buddyId === "goat10") {
        for (let pulse = 0; pulse < 5; pulse += 1) {
          tone(context, master, "sawtooth", 430 + pulse * 34, 690 - pulse * 18, now + pulse * 0.055, 0.105);
        }
      } else if (buddyId === "camel7") {
        tone(context, master, "sawtooth", 175, 118, now, 0.48);
        tone(context, master, "triangle", 235, 152, now + 0.12, 0.52);
        noise(context, master, now + 0.08, 0.28, 340);
      } else if (buddyId === "memeCat") {
        tone(context, master, "sawtooth", 720, 1_060, now, 0.22);
        tone(context, master, "sine", 1_040, 580, now + 0.19, 0.32);
      } else {
        tone(context, master, "square", 310, 185, now, 0.13);
        noise(context, master, now, 0.1, 730);
        tone(context, master, "square", 350, 205, now + 0.18, 0.12);
        noise(context, master, now + 0.18, 0.09, 820);
      }
      break;
    case "footstep":
      tone(context, master, "sine", 125, 72, now, 0.09);
      noise(context, master, now, 0.07, buddyId === "camel7" ? 125 : 210);
      tone(context, master, "sine", 118, 68, now + 0.14, 0.09);
      noise(context, master, now + 0.14, 0.07, buddyId === "camel7" ? 115 : 195);
      break;
    case "flourish":
      tone(context, master, waveform, low * 0.88, high * 1.08, now, 0.24);
      tone(context, master, "sine", high * 0.72, high * 1.25, now + 0.12, 0.31);
      if (buddyId === "camel7") tone(context, master, "triangle", 240, 720, now + 0.25, 0.28);
      break;
    case "startled":
      tone(context, master, waveform, high * 1.25, low * 0.8, now, 0.34);
      tone(context, master, "sine", high * 1.7, high, now + 0.045, 0.2);
      break;
    case "petted":
      tone(context, master, "sine", low * 0.72, low * 0.9, now, 0.48);
      tone(context, master, "sine", low * 1.02, low * 1.12, now + 0.08, 0.42);
      break;
    case "drop":
      tone(context, master, "triangle", high, low * 0.55, now, 0.16);
      break;
    case "exit":
      tone(context, master, waveform, high, low * 0.6, now, 0.22);
      tone(context, master, "sine", high * 1.3, high * 1.7, now + 0.13, 0.18);
      break;
    case "paper":
      noise(context, master, now, 0.24, 1_900);
      tone(context, master, "triangle", 260, 120, now + 0.05, 0.17);
      break;
    case "rustle":
      noise(context, master, now, 0.13, 2_400);
      noise(context, master, now + 0.1, 0.17, 1_750);
      noise(context, master, now + 0.23, 0.11, 2_900);
      break;
    case "scratch":
      noise(context, master, now, 0.34, 3_200);
      noise(context, master, now + 0.11, 0.3, 2_600);
      break;
    case "splash":
      noise(context, master, now, 0.28, 820);
      tone(context, master, "sine", 380, 95, now, 0.31);
      break;
    case "speed":
      tone(context, master, "sine", 190, 920, now, 0.34);
      tone(context, master, "triangle", 260, 1_240, now + 0.07, 0.27);
      break;
    case "skid":
      noise(context, master, now, 0.42, 2_100);
      tone(context, master, "triangle", 760, 120, now, 0.38);
      tone(context, master, "sine", 980, 310, now + 0.08, 0.24);
      break;
    case "whoosh":
      noise(context, master, now, 0.34, 1_150);
      tone(context, master, "sine", 120, 780, now, 0.3);
      break;
    case "victory":
      // Original synthetic celebration cue; no sampled celebrity voice or recording.
      tone(context, master, "triangle", 220, 520, now, 0.28);
      tone(context, master, "sawtooth", 360, 760, now + 0.17, 0.34);
      tone(context, master, "sine", 760, 420, now + 0.44, 0.38);
      noise(context, master, now + 0.38, 0.34, 1_600);
      break;
    case "chime":
      tone(context, master, "sine", 523, 523, now, 0.38);
      tone(context, master, "sine", 659, 659, now + 0.1, 0.4);
      tone(context, master, "sine", 784, 784, now + 0.2, 0.48);
      break;
    case "impact":
      tone(context, master, "square", 150, 58, now, 0.19);
      noise(context, master, now, 0.16, 180);
      break;
    case "greeting":
      tone(context, master, waveform, low, high, now, 0.42);
      tone(context, master, "sine", high * 0.75, high, now + 0.12, 0.3);
      break;
  }

  globalThis.setTimeout(() => void context.close(), 850);
}

export function playActionSfx(buddyId: BuddyId, actionId: string, volumePercent = 70): void {
  playBuddySfx(buddyId, volumePercent, soundKindForAction(actionId));
}

const CHATTER_CADENCE: Record<Locale, number> = {
  vi: 0.105,
  en: 0.115,
  ko: 0.13,
  ja: 0.12,
};

/**
 * Creates short species-like chatter from the visible line. This is deliberately
 * not intelligible human speech: no microphone, voice cloning, network request,
 * or hidden spoken content. The readable sentence remains in the bubble.
 */
export function playDialogueChatter(
  buddyId: BuddyId,
  text: string,
  locale: Locale,
  volumePercent = 70,
): void {
  const AudioContextClass = globalThis.AudioContext;
  if (!AudioContextClass || !text.trim()) return;
  const context = new AudioContextClass({ latencyHint: "interactive" });
  const master = context.createGain();
  const now = context.currentTime;
  const [low, high, waveform] = VOICES[buddyId];
  const peak = Math.max(0, Math.min(1, volumePercent / 100)) * 0.045;
  const pulseCount = Math.max(3, Math.min(9, Math.ceil([...text].length / 9)));
  const cadence = CHATTER_CADENCE[locale];
  master.gain.setValueAtTime(peak, now);
  master.connect(context.destination);
  void context.resume();

  const characters = [...text].filter((character) => /[\p{L}\p{N}]/u.test(character));
  for (let index = 0; index < pulseCount; index += 1) {
    const character = characters[index % Math.max(1, characters.length)] ?? "B";
    const variation = character.codePointAt(0)! % 7;
    const from = low * (0.88 + variation * 0.035);
    const to = index % 3 === 2 ? low * 0.76 : high * (0.82 + variation * 0.025);
    tone(context, master, waveform, from, to, now + index * cadence, cadence * 0.76);
  }
  const lifetime = Math.ceil((pulseCount * cadence + 0.35) * 1_000);
  globalThis.setTimeout(() => void context.close(), lifetime);
}
