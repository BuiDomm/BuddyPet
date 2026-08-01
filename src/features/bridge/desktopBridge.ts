import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { playBuddySfx } from "../audio/sfx";
import { playDialogueVoice } from "../audio/voice";
import { BUDDIES, DEFAULT_BUDDY_ACTION_ID, DEFAULT_SNAPSHOT, mergeSettings } from "../domain/defaults";
import { DEFAULT_BUDDY_ID } from "../domain/types";
import type {
  ActionRequest,
  AppSnapshot,
  CaptureRegionRequest,
  DirectorEvent,
  EpisodePlan,
  Locale,
  RendererEvent,
  SettingsV1,
  SpeakDialogueRequest,
  VoicePackStatus,
  WindowRole,
} from "../domain/types";

const STORAGE_KEY = "buddypet.browser-snapshot.v1";
const BROWSER_EVENT = "buddypet:browser-overlay";
let lastSnapshot: AppSnapshot | null = null;

const COMMANDS = {
  snapshot: "get_app_snapshot",
  updateSettings: "update_settings",
  completeOnboarding: "complete_onboarding",
  action: "perform_app_action",
  overlayPayload: "get_window_context",
  rendererEvent: "renderer_event",
  captureRegion: "capture_region",
  petMenu: "set_pet_menu_open",
  voicePackStatus: "get_voice_pack_status",
  installVoicePack: "install_voice_pack",
  speakDialogue: "speak_dialogue",
  stopDialogue: "stop_dialogue",
} as const;

const EVENTS = {
  plan: "buddy://episode-plan",
  hide: "buddy://hide",
  snapshot: "buddy://snapshot",
  director: "buddy://director-command",
  voicePack: "buddy://voice-pack",
} as const;

const VOICE_PACK_META: Record<Locale, Omit<VoicePackStatus, "state" | "downloadedBytes" | "error">> = {
  vi: { locale: "vi", id: "piper-vi-vais1000-medium", version: "1", name: "Tiếng Việt · VAIS-1000", engine: "Piper VITS", license: "MIT model · CC BY 4.0 corpus", licenseUrl: "https://huggingface.co/rhasspy/piper-voices/blob/main/vi/vi_VN/vais1000/medium/MODEL_CARD", totalBytes: 67_154_040 },
  en: { locale: "en", id: "piper-en-ljspeech-medium", version: "1", name: "English · LJSpeech", engine: "Piper VITS", license: "MIT model · public-domain corpus", licenseUrl: "https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/ljspeech/medium/MODEL_CARD", totalBytes: 67_169_893 },
  ko: { locale: "ko", id: "supertonic-3-int8-2026-05-11", version: "2026-05-11", name: "Supertonic 3 multilingual", engine: "Supertonic 3", license: "OpenRAIL-M", licenseUrl: "https://huggingface.co/Supertone/supertonic-3/blob/main/LICENSE", totalBytes: 128_774_318 },
  ja: { locale: "ja", id: "supertonic-3-int8-2026-05-11", version: "2026-05-11", name: "Supertonic 3 multilingual", engine: "Supertonic 3", license: "OpenRAIL-M", licenseUrl: "https://huggingface.co/Supertone/supertonic-3/blob/main/LICENSE", totalBytes: 128_774_318 },
};

function missingVoicePack(locale: Locale): VoicePackStatus {
  return { ...VOICE_PACK_META[locale], state: "missing", downloadedBytes: 0, error: null };
}

function isTauriRuntime(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

function browserSnapshot(): AppSnapshot {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (!value) return structuredClone(DEFAULT_SNAPSHOT);
    const parsed = JSON.parse(value) as Partial<AppSnapshot>;
    return {
      settings: mergeSettings(parsed.settings),
      runtime: { ...DEFAULT_SNAPSHOT.runtime, ...parsed.runtime },
    };
  } catch {
    return structuredClone(DEFAULT_SNAPSHOT);
  }
}

function saveBrowserSnapshot(snapshot: AppSnapshot): AppSnapshot {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  return snapshot;
}

function overlayFromQuery(): EpisodePlan {
  const params = new URLSearchParams(window.location.search);
  const eventId = params.get("eventId") ?? "browser-preview";
  const requestedPet = params.get("pet");
  const petId = BUDDIES.some((buddy) => buddy.id === requestedPet)
    ? requestedPet as EpisodePlan["petId"]
    : DEFAULT_BUDDY_ID;
  const defaultAction = BUDDIES.find((buddy) => buddy.id === petId)?.actions[0] ?? DEFAULT_BUDDY_ACTION_ID;
  return {
    eventId,
    trigger: params.get("trigger") === "tutorial" ? "tutorial" : "manual",
    petId,
    actionId: params.get("action") ?? defaultAction,
    lineKey: params.get("lineKey") ?? "signature-start",
    monitorId: "browser",
    anchorRect: { x: 0, y: 0, width: 360, height: 300 },
    motionPath: [{ x: -260, y: 0, width: 360, height: 300 }, { x: 0, y: 0, width: 360, height: 300 }],
    introDurationMs: 2_000,
    captureRect: null,
    locale: "vi",
    tone: params.get("tone") === "sassy" ? "sassy" : "kind",
    seed: 10,
    reduceMotion: params.get("reduceMotion") === "true",
    powerSaver: params.get("powerSaver") === "true",
    line: params.get("line") ?? undefined,
  };
}

async function nativeOr<T>(command: string, args: Record<string, unknown>, fallback: () => T | Promise<T>): Promise<T> {
  if (!isTauriRuntime()) return fallback();
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    if (import.meta.env.DEV) console.warn(`[BuddyPet] ${command} fell back to browser behavior`, error);
    return fallback();
  }
}

export interface DesktopBridge {
  getWindowRole(): Promise<WindowRole>;
  getSnapshot(): Promise<AppSnapshot>;
  updateSettings(settings: SettingsV1): Promise<AppSnapshot>;
  completeOnboarding(settings: SettingsV1): Promise<AppSnapshot>;
  performAction(request: ActionRequest): Promise<AppSnapshot>;
  getOverlayPayload(): Promise<EpisodePlan | null>;
  captureRegion(request: CaptureRegionRequest): Promise<ArrayBuffer | Uint8Array | null>;
  sendRendererEvent(event: RendererEvent): Promise<void>;
  setPetMenuOpen(open: boolean): Promise<void>;
  getVoicePackStatus(locale: Locale): Promise<VoicePackStatus>;
  installVoicePack(locale: Locale): Promise<VoicePackStatus>;
  speakDialogue(request: SpeakDialogueRequest): Promise<boolean>;
  stopDialogue(): Promise<void>;
  subscribeOverlay(callback: (plan: EpisodePlan | null) => void): Promise<UnlistenFn>;
  subscribeSnapshot(callback: (snapshot: AppSnapshot) => void): Promise<UnlistenFn>;
  subscribeDirector(callback: (event: DirectorEvent) => void): Promise<UnlistenFn>;
  subscribeVoicePack(callback: (status: VoicePackStatus) => void): Promise<UnlistenFn>;
}

export const desktopBridge: DesktopBridge = {
  async getWindowRole() {
    const queryRole = new URLSearchParams(window.location.search).get("window");
    if (queryRole === "pet-stage" || queryRole === "bubble" || queryRole === "effect" || queryRole === "settings") {
      return queryRole;
    }
    if (!isTauriRuntime()) return "settings";
    const label = getCurrentWindow().label;
    if (label.startsWith("pet-stage")) return "pet-stage";
    if (label.startsWith("bubble")) return "bubble";
    if (label.startsWith("effect") || label.startsWith("fx-")) return "effect";
    return "settings";
  },

  async getSnapshot() {
    const snapshot = await nativeOr(COMMANDS.snapshot, {}, browserSnapshot);
    lastSnapshot = snapshot;
    return snapshot;
  },

  async updateSettings(settings) {
    const snapshot = await nativeOr(COMMANDS.updateSettings, { settings }, () => {
      const current = browserSnapshot();
      return saveBrowserSnapshot({ ...current, settings: mergeSettings(settings) });
    });
    lastSnapshot = snapshot;
    return snapshot;
  },

  async completeOnboarding(settings) {
    const complete = { ...settings, onboardingCompleted: true };
    const snapshot = await nativeOr(COMMANDS.completeOnboarding, { settings: complete }, () => {
      const current = browserSnapshot();
      return saveBrowserSnapshot({ ...current, settings: complete });
    });
    lastSnapshot = snapshot;
    return snapshot;
  },

  async performAction(request) {
    if (request.action === "previewSound") {
      const snapshot = lastSnapshot ?? browserSnapshot();
      playBuddySfx(request.petId ?? snapshot.settings.selectedPets[0] ?? DEFAULT_BUDDY_ID, snapshot.settings.soundVolume);
      if (snapshot.settings.behaviorToggles.voice && request.text && request.locale) {
        const voiceRequest = {
          petId: request.petId ?? snapshot.settings.selectedPets[0] ?? DEFAULT_BUDDY_ID,
          text: request.text,
          locale: request.locale,
          volume: snapshot.settings.soundVolume,
        } satisfies SpeakDialogueRequest;
        const nativeVoice = await nativeOr(COMMANDS.speakDialogue, { request: voiceRequest }, () => false);
        if (!nativeVoice) {
          playDialogueVoice(voiceRequest.petId, voiceRequest.text, voiceRequest.locale, voiceRequest.volume);
        }
      }
    }
    const next = await nativeOr(COMMANDS.action, { request }, () => {
      const snapshot = browserSnapshot();
      const runtime = { ...snapshot.runtime };
      if (request.action === "pause") runtime.paused = true;
      if (request.action === "resume") runtime.paused = false;
      if (request.action === "mute") runtime.muted = true;
      if (request.action === "unmute") runtime.muted = false;
      if (request.action === "hide") runtime.activeEpisode = false;
      if (request.action === "summon" || request.action === "previewAction") runtime.activeEpisode = true;
      if (request.action === "snooze") {
        runtime.snoozedUntil = new Date(Date.now() + (request.durationMinutes ?? 30) * 60_000).toISOString();
      }
      if (request.action === "meeting") {
        runtime.snoozedUntil = new Date(Date.now() + (request.durationMinutes ?? 60) * 60_000).toISOString();
      }
      if (request.action === "requestCapture") runtime.capturePermission = "granted";
      return saveBrowserSnapshot({ ...snapshot, runtime });
    });
    lastSnapshot = next;
    return next;
  },

  async getOverlayPayload() {
    return nativeOr(COMMANDS.overlayPayload, {}, overlayFromQuery);
  },

  async captureRegion(request) {
    if (!isTauriRuntime()) return null;
    try {
      return await invoke<ArrayBuffer | Uint8Array>(COMMANDS.captureRegion, { request });
    } catch {
      return null;
    }
  },

  async sendRendererEvent(event) {
    await nativeOr<void>(COMMANDS.rendererEvent, { event }, () => undefined);
  },

  async setPetMenuOpen(open) {
    await nativeOr<void>(COMMANDS.petMenu, { open }, () => undefined);
  },

  async getVoicePackStatus(locale) {
    return nativeOr(COMMANDS.voicePackStatus, { locale }, () => missingVoicePack(locale));
  },

  async installVoicePack(locale) {
    return nativeOr(COMMANDS.installVoicePack, { locale }, () => ({ ...missingVoicePack(locale), state: "error", error: "desktopOnly" }));
  },

  async speakDialogue(request) {
    return nativeOr(COMMANDS.speakDialogue, { request }, () => false);
  },

  async stopDialogue() {
    await nativeOr<void>(COMMANDS.stopDialogue, {}, () => undefined);
  },

  async subscribeOverlay(callback) {
    if (isTauriRuntime()) {
      const offPlan = await listen<EpisodePlan>(EVENTS.plan, (event) => callback(event.payload));
      const offHide = await listen(EVENTS.hide, () => callback(null));
      return () => {
        offPlan();
        offHide();
      };
    }
    const handler = (event: Event) => callback((event as CustomEvent<EpisodePlan | null>).detail);
    window.addEventListener(BROWSER_EVENT, handler);
    return () => window.removeEventListener(BROWSER_EVENT, handler);
  },

  async subscribeSnapshot(callback) {
    if (!isTauriRuntime()) return () => undefined;
    return listen<AppSnapshot>(EVENTS.snapshot, (event) => {
      lastSnapshot = event.payload;
      callback(event.payload);
    });
  },

  async subscribeDirector(callback) {
    if (!isTauriRuntime()) return () => undefined;
    return listen<DirectorEvent>(EVENTS.director, (event) => callback(event.payload));
  },

  async subscribeVoicePack(callback) {
    if (!isTauriRuntime()) return () => undefined;
    return listen<VoicePackStatus>(EVENTS.voicePack, (event) => callback(event.payload));
  },
};
