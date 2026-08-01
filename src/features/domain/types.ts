export const SUPPORTED_LOCALES = ["vi", "en", "ko", "ja"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const BUDDY_IDS = ["goat10", "camel7", "memeCat", "shiba"] as const;
export type BuddyId = (typeof BUDDY_IDS)[number];
export const DEFAULT_BUDDY_ID: BuddyId = "memeCat";

export type Tone = "kind" | "sassy";
export type Intensity = "gentle" | "playful" | "chaos";
export type WindowRole = "settings" | "pet-stage" | "bubble" | "effect";
export type NavigationSection =
  | "home"
  | "buddies"
  | "mischief"
  | "routine"
  | "sound"
  | "privacy"
  | "accessibility"
  | "playground";

export interface QuietHours {
  enabled: boolean;
  startMinute: number;
  endMinute: number;
}

export interface BehaviorToggles {
  fakeDamage: boolean;
  coverContent: boolean;
  cursorPlay: boolean;
  sfx: boolean;
  voice: boolean;
}

export interface SettingsV1 {
  schemaVersion: 1;
  locale: Locale;
  selectedPets: BuddyId[];
  tone: Tone;
  intensity: Intensity;
  quietHours: QuietHours;
  immersiveEnabled: boolean;
  sound: boolean;
  soundVolume: number;
  autostart: boolean;
  reduceMotion: boolean;
  meetingModeUntil: string | null;
  behaviorToggles: BehaviorToggles;
  onboardingCompleted: boolean;
  hotkey: string;
  telemetryEnabled: boolean;
}

export interface RuntimeState {
  paused: boolean;
  muted: boolean;
  activeEpisode: boolean;
  activeStreakSeconds: number;
  nextEpisodeAt: string | null;
  snoozedUntil: string | null;
  dailyEpisodeCount: number;
  capturePermission: "unknown" | "granted" | "denied" | "unavailable";
}

export interface AppSnapshot {
  settings: SettingsV1;
  runtime: RuntimeState;
}

export interface VoicePackStatus {
  state: "missing" | "downloading" | "installing" | "ready" | "error";
  locale: Locale;
  id: string;
  version: string;
  name: string;
  engine: string;
  license: string;
  licenseUrl: string;
  downloadedBytes: number;
  totalBytes: number;
  error: string | null;
}

export interface SpeakDialogueRequest {
  text: string;
  locale: Locale;
  petId: BuddyId;
  volume: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CaptureRegionRequest {
  monitorId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EpisodePlan {
  eventId: string;
  trigger: "focusNudge" | "random" | "manual" | "tutorial";
  petId: BuddyId;
  actionId: string;
  lineKey: string;
  monitorId: string;
  anchorRect: Rect;
  motionPath: Rect[];
  introDurationMs: number;
  captureRect: Rect | null;
  locale: Locale;
  tone: Tone;
  seed: number;
  reduceMotion: boolean;
  powerSaver: boolean;
  line?: string;
}

export type RendererEvent =
  | { type: "ready"; eventId: string }
  | { type: "poseChanged"; eventId: string; pose: string }
  | { type: "clicked"; eventId: string }
  | { type: "dragged"; eventId: string; anchor?: Rect }
  | { type: "petted"; eventId: string }
  | { type: "marker"; eventId: string; marker: string }
  | { type: "completed"; eventId: string }
  | { type: "failed"; eventId: string; reason: string };

export type DirectorEvent =
  | { type: "setPhase"; eventId: string; phase: string }
  | { type: "react"; eventId: string; reaction: "startledAndRelocate" | "petted" | "dragReleased"; relocateTo?: Rect }
  | { type: "hide"; eventId: string; reason: string }
  | { type: "blocked"; reason: string }
  | { type: "start"; plan: EpisodePlan };

export type DesktopAction =
  | "summon"
  | "hide"
  | "pause"
  | "resume"
  | "mute"
  | "unmute"
  | "meeting"
  | "snooze"
  | "requestCapture"
  | "previewSound"
  | "previewAction"
  | "lessOfThis"
  | "quit";

export interface ActionRequest {
  action: DesktopAction;
  durationMinutes?: number;
  petId?: BuddyId;
  actionId?: string;
  text?: string;
  locale?: Locale;
}

export interface BuddyDefinition {
  id: BuddyId;
  name: string;
  tagline: string;
  number?: string;
  accent: string;
  softAccent: string;
  actions: readonly string[];
}
