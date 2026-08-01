import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { playBuddySfx } from "../audio/sfx";
import { DEFAULT_SNAPSHOT, mergeSettings } from "../domain/defaults";
import type {
  ActionRequest,
  AppSnapshot,
  CaptureRegionRequest,
  EpisodePlan,
  RendererEvent,
  SettingsV1,
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
} as const;

const EVENTS = {
  plan: "buddy://episode-plan",
  hide: "buddy://hide",
  snapshot: "buddy://snapshot",
} as const;

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
  return {
    eventId,
    trigger: params.get("trigger") === "tutorial" ? "tutorial" : "manual",
    petId:
      params.get("pet") === "camel7" ||
      params.get("pet") === "memeCat" ||
      params.get("pet") === "shiba"
        ? (params.get("pet") as EpisodePlan["petId"])
        : "goat10",
    actionId: params.get("action") ?? "headbutt",
    monitorId: "browser",
    anchorRect: { x: 0, y: 0, width: 360, height: 300 },
    captureRect: null,
    locale: "vi",
    tone: params.get("tone") === "sassy" ? "sassy" : "kind",
    seed: 10,
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
  subscribeOverlay(callback: (plan: EpisodePlan | null) => void): Promise<UnlistenFn>;
  subscribeSnapshot(callback: (snapshot: AppSnapshot) => void): Promise<UnlistenFn>;
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
      playBuddySfx(request.petId ?? snapshot.settings.selectedPets[0] ?? "goat10", snapshot.settings.soundVolume);
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
};
