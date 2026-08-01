import { DEFAULT_BUDDY_ID, type AppSnapshot, type BuddyDefinition, type SettingsV1 } from "./types";

export const DEFAULT_SETTINGS: SettingsV1 = {
  schemaVersion: 1,
  locale: "vi",
  selectedPets: [DEFAULT_BUDDY_ID],
  tone: "kind",
  intensity: "playful",
  quietHours: { enabled: true, startMinute: 22 * 60, endMinute: 8 * 60 },
  immersiveEnabled: true,
  sound: false,
  soundVolume: 70,
  autostart: false,
  reduceMotion: false,
  meetingModeUntil: null,
  behaviorToggles: {
    fakeDamage: true,
    coverContent: true,
    cursorPlay: true,
    sfx: true,
    voice: true,
  },
  onboardingCompleted: false,
  hotkey: "Control+Alt+B",
  telemetryEnabled: false,
};

export const DEFAULT_SNAPSHOT: AppSnapshot = {
  settings: DEFAULT_SETTINGS,
  runtime: {
    paused: false,
    muted: false,
    activeEpisode: false,
    activeStreakSeconds: 38 * 60 + 14,
    nextEpisodeAt: new Date(Date.now() + 18 * 60_000).toISOString(),
    snoozedUntil: null,
    dailyEpisodeCount: 0,
    capturePermission: "unknown",
  },
};

export const BUDDIES: readonly BuddyDefinition[] = [
  {
    id: "goat10",
    name: "Goat #10",
    tagline: "Small hooves. Legendary dribbles.",
    number: "10",
    accent: "#5d8ee8",
    softAccent: "#e9f3ff",
    actions: ["headbutt", "nibble", "dribble"],
  },
  {
    id: "camel7",
    name: "Camel #7",
    tagline: "Tall, dramatic, absolutely confident.",
    number: "7",
    accent: "#b9773e",
    softAccent: "#fff1dc",
    actions: ["stretch", "chew", "splash"],
  },
  {
    id: "memeCat",
    name: "Meme Cat",
    tagline: "Judges your tabs. Sits on them anyway.",
    accent: "#8468c8",
    softAccent: "#f1ebff",
    actions: ["slap", "scratch", "loaf"],
  },
  {
    id: "shiba",
    name: "Shiba Inu",
    tagline: "Much zoom. Very break. Wow.",
    accent: "#e67835",
    softAccent: "#fff0df",
    actions: ["tug", "dig", "zoomies"],
  },
] as const;

export const DEFAULT_BUDDY = BUDDIES.find((buddy) => buddy.id === DEFAULT_BUDDY_ID)!;
export const DEFAULT_BUDDY_ACTION_ID = DEFAULT_BUDDY.actions[0] ?? "slap";

export const INTENSITY_META = {
  gentle: {
    focusMinutes: 60,
    range: "90–150 min",
    cooldown: 45,
    daily: 4,
  },
  playful: {
    focusMinutes: 50,
    range: "45–90 min",
    cooldown: 20,
    daily: 6,
  },
  chaos: {
    focusMinutes: 40,
    range: "25–50 min",
    cooldown: 12,
    daily: 8,
  },
} as const;

export function mergeSettings(settings?: Partial<SettingsV1>): SettingsV1 {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    quietHours: { ...DEFAULT_SETTINGS.quietHours, ...settings?.quietHours },
    behaviorToggles: {
      ...DEFAULT_SETTINGS.behaviorToggles,
      ...settings?.behaviorToggles,
    },
  };
}

export function minutesToTime(minutes: number): string {
  const safeMinutes = Math.max(0, Math.min(1439, Math.round(minutes)));
  return `${String(Math.floor(safeMinutes / 60)).padStart(2, "0")}:${String(safeMinutes % 60).padStart(2, "0")}`;
}

export function timeToMinutes(value: string): number {
  const [hours = "0", minutes = "0"] = value.split(":");
  return Math.max(0, Math.min(1439, Number(hours) * 60 + Number(minutes)));
}
