import type { BuddyId, Locale } from "../domain/types";

const LANGUAGE_TAGS: Record<Locale, string> = {
  vi: "vi-VN",
  en: "en-US",
  ko: "ko-KR",
  ja: "ja-JP",
};

const VOICE_STYLE: Record<BuddyId, { pitch: number; rate: number }> = {
  goat10: { pitch: 1.02, rate: 0.98 },
  camel7: { pitch: 0.94, rate: 0.92 },
  memeCat: { pitch: 1.05, rate: 1.0 },
  shiba: { pitch: 1.08, rate: 1.06 },
};

const PREFERRED_VOICE_NAMES: Record<Locale, readonly string[]> = {
  vi: ["Linh"],
  en: ["Samantha", "Ava", "Allison"],
  ko: ["Yuna"],
  ja: ["Kyoko", "Otoya"],
};

/**
 * Speaks only the sentence already visible in the bubble using an installed OS
 * voice. Web Speech on macOS/Windows stays on-device, needs no microphone, and
 * avoids bundling or cloning a real person's voice.
 */
export function playDialogueVoice(
  buddyId: BuddyId,
  text: string,
  locale: Locale,
  volumePercent = 70,
): boolean {
  const synthesizer = globalThis.speechSynthesis;
  const Utterance = globalThis.SpeechSynthesisUtterance;
  if (!synthesizer || !Utterance || !text.trim()) return false;

  const utterance = new Utterance(text.trim());
  const language = LANGUAGE_TAGS[locale];
  const style = VOICE_STYLE[buddyId];
  utterance.lang = language;
  utterance.pitch = style.pitch;
  utterance.rate = style.rate;
  utterance.volume = Math.max(0, Math.min(1, volumePercent / 100));
  const languagePrefix = language.slice(0, 2).toLowerCase();
  const matchingVoices = synthesizer
    .getVoices()
    .filter((voice) => voice.lang.toLowerCase().startsWith(languagePrefix));
  const installedVoice = PREFERRED_VOICE_NAMES[locale]
    .map((name) => matchingVoices.find((voice) => voice.name === name))
    .find((voice) => voice !== undefined)
    ?? matchingVoices.find((voice) => voice.default)
    ?? matchingVoices.find((voice) => voice.localService)
    ?? matchingVoices[0];
  if (installedVoice) utterance.voice = installedVoice;

  synthesizer.cancel();
  synthesizer.speak(utterance);
  return true;
}

export function stopDialogueVoice(): void {
  globalThis.speechSynthesis?.cancel();
}
