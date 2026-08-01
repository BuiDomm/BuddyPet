import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "../../components/Badge";
import { BuddyCharacter, type BuddyMood } from "../../components/BuddyCharacter";
import { Button } from "../../components/Button";
import { Icon, type IconName } from "../../components/Icon";
import { PageHeader } from "../../components/PageHeader";
import { Toggle } from "../../components/Toggle";
import { BUDDIES, DEFAULT_BUDDY, DEFAULT_BUDDY_ACTION_ID, INTENSITY_META, minutesToTime, timeToMinutes } from "../domain/defaults";
import { desktopBridge } from "../bridge/desktopBridge";
import { minutesUntilLocalTomorrow } from "../domain/time";
import { DEFAULT_BUDDY_ID, type ActionRequest, type AppSnapshot, type BuddyId, type Intensity, type Locale, type NavigationSection, type SettingsV1, type Tone, type VoicePackStatus } from "../domain/types";

interface PageProps {
  snapshot: AppSnapshot;
  onPatch: (patch: Partial<SettingsV1>) => void;
  onAction: (request: ActionRequest) => Promise<void>;
  onNavigate: (section: NavigationSection) => void;
}

interface SettingsPageProps extends PageProps {
  section: NavigationSection;
}

export function SettingsPage({ section, ...props }: SettingsPageProps) {
  if (section === "buddies") return <BuddiesPage {...props} />;
  if (section === "mischief") return <MischiefPage {...props} />;
  if (section === "routine") return <RoutinePage {...props} />;
  if (section === "sound") return <SoundPage {...props} />;
  if (section === "privacy") return <PrivacyPage {...props} />;
  if (section === "accessibility") return <AccessibilityPage {...props} />;
  if (section === "playground") return <PlaygroundPage {...props} />;
  return <HomePage {...props} />;
}

function formatStreak(seconds: number, hoursShort: string, minutesShort: string) {
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours} ${hoursShort} ${minutes % 60} ${minutesShort}` : `${minutes} ${minutesShort}`;
}

function formatClock(value: string | null, fallback: string, locale: Locale) {
  if (!value) return fallback;
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatMegabytes(bytes: number, locale: Locale) {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(bytes / 1_048_576)} MB`;
}

function HomePage({ snapshot, onPatch, onAction, onNavigate }: PageProps) {
  const { t } = useTranslation();
  const buddy = BUDDIES.find((item) => item.id === snapshot.settings.selectedPets[0]) ?? DEFAULT_BUDDY;
  const meta = INTENSITY_META[snapshot.settings.intensity];
  const nextVisit = snapshot.runtime.snoozedUntil
    ? formatClock(snapshot.runtime.snoozedUntil, "—", snapshot.settings.locale)
    : formatClock(snapshot.runtime.nextEpisodeAt, t("dashboard.whenReady", { defaultValue: "When ready" }), snapshot.settings.locale);

  return (
    <div className="page page--home">
      <PageHeader
        eyebrow={t("dashboard.eyebrow", { defaultValue: "YOUR DESKTOP, BUT ALIVE" })}
        title={t("dashboard.title", { defaultValue: "Good to see you." })}
        description={t("dashboard.description", { defaultValue: "BuddyPet is keeping an eye on your focus streak — from a respectful distance." })}
        action={<Button variant="ghost" icon="settings" onClick={() => onNavigate("routine")}>{t("dashboard.adjust", { defaultValue: "Adjust routine" })}</Button>}
      />

      <section className="dashboard-hero">
        <div className="dashboard-hero__glow" />
        <div className="dashboard-hero__copy">
          <Badge tone="success">● {snapshot.runtime.paused ? t("status.napping", { defaultValue: "Napping" }) : t("status.onPatrol", { defaultValue: "On patrol" })}</Badge>
          <h2>{snapshot.runtime.paused ? t("dashboard.napTitle", { defaultValue: "The desk is suspiciously peaceful." }) : t("dashboard.heroTitle", { defaultValue: "All quiet… for now." })}</h2>
          <p>{snapshot.runtime.paused ? t("dashboard.napText", { defaultValue: "Resume whenever you want a little company again." }) : t("dashboard.heroText", { defaultValue: "I’ll wait for a safe moment before attempting anything extremely professional." })}</p>
          <div className="dashboard-hero__actions">
            <Button icon={snapshot.runtime.paused ? "play" : "wand"} onClick={() => void onAction({ action: snapshot.runtime.paused ? "resume" : "summon", petId: buddy.id })}>
              {snapshot.runtime.paused ? t("common.resume", { defaultValue: "Resume" }) : t("dashboard.sayHi", { defaultValue: "Say hi now" })}
            </Button>
            <Button variant="ghost" onClick={() => onNavigate("playground")}>{t("dashboard.openPlayground", { defaultValue: "Open playground" })}</Button>
          </div>
        </div>
        <div className="dashboard-hero__scene">
          <div className="scene-cloud scene-cloud--one" /><div className="scene-cloud scene-cloud--two" />
          <BuddyCharacter buddyId={buddy.id} size="stage" mood="happy" />
          <div className="hero-speech">{snapshot.settings.tone === "sassy" ? t("dashboard.sassyBubble", { defaultValue: "I can smell an unread notification." }) : t("dashboard.kindBubble", { defaultValue: "You focus. I’ll guard the pixels." })}</div>
        </div>
      </section>

      <section className="stat-grid">
        <article className="stat-card stat-card--focus"><span className="stat-card__icon"><Icon name="bolt"/></span><div><small>{t("dashboard.focusStreak", { defaultValue: "ACTIVE STREAK" })}</small><strong>{formatStreak(snapshot.runtime.activeStreakSeconds, t("common.hoursShort", { defaultValue: "h" }), t("common.minutesShort", { defaultValue: "min" }))}</strong><p>{t("dashboard.focusHelp", { defaultValue: "Only idle time is measured" })}</p></div><div className="mini-progress"><span style={{ width: `${Math.min(100, snapshot.runtime.activeStreakSeconds / (meta.focusMinutes * 60) * 100)}%` }} /></div></article>
        <article className="stat-card"><span className="stat-card__icon stat-card__icon--blue"><Icon name="clock"/></span><div><small>{snapshot.runtime.snoozedUntil ? t("dashboard.snoozedUntil", { defaultValue: "SNOOZED UNTIL" }) : t("dashboard.nextChance", { defaultValue: "NEXT CHANCE" })}</small><strong>{nextVisit}</strong><p>{t("dashboard.neverGuaranteed", { defaultValue: "Only if it’s a good moment" })}</p></div></article>
        <article className="stat-card"><span className="stat-card__icon stat-card__icon--orange"><Icon name="sparkles"/></span><div><small>{t("dashboard.dailyBudget", { defaultValue: "DAILY MISCHIEF" })}</small><strong>{snapshot.runtime.dailyEpisodeCount} <em>/ {meta.daily}</em></strong><p>{t("dashboard.budgetHelp", { defaultValue: "Manual visits don’t count" })}</p></div></article>
      </section>

      <section className="dashboard-lower">
        <div className="panel-card quick-settings">
          <div className="card-heading"><div><h2>{t("dashboard.quickControls", { defaultValue: "Quick controls" })}</h2><p>{t("dashboard.quickControlsHelp", { defaultValue: "The switches you’ll reach for most." })}</p></div></div>
          <Toggle checked={!snapshot.runtime.muted && snapshot.settings.sound} onChange={(checked) => { if (!snapshot.settings.sound && checked) onPatch({ sound: true }); void onAction({ action: checked ? "unmute" : "mute" }); }} label={t("sound.effects", { defaultValue: "Buddy sounds" })} description={t("sound.quickHelp", { defaultValue: "Local sound effects only — no voice recording." })} />
          <Toggle checked={snapshot.settings.quietHours.enabled} onChange={(enabled) => onPatch({ quietHours: { ...snapshot.settings.quietHours, enabled } })} label={t("routine.quietHours", { defaultValue: "Quiet hours" })} description={`${minutesToTime(snapshot.settings.quietHours.startMinute)} — ${minutesToTime(snapshot.settings.quietHours.endMinute)}`} />
          <Toggle checked={snapshot.settings.behaviorToggles.fakeDamage} onChange={(fakeDamage) => onPatch({ behaviorToggles: { ...snapshot.settings.behaviorToggles, fakeDamage } })} label={t("mischief.fakeDamage", { defaultValue: "Fake damage effects" })} description={t("mischief.fakeDamageShort", { defaultValue: "Cracks, bites, and paper tears made from pixels." })} />
        </div>
        <div className="panel-card next-break-card">
          <div className="card-heading"><div><h2>{t("dashboard.needSpace", { defaultValue: "Need some space?" })}</h2><p>{t("dashboard.snoozeHelp", { defaultValue: "BuddyPet won’t take it personally. Probably." })}</p></div><Icon name="coffee"/></div>
          <div className="snooze-buttons">
            {[15, 30, 60].map((minutes) => <button type="button" key={minutes} onClick={() => void onAction({ action: "snooze", durationMinutes: minutes })}>{minutes}<small>{t("common.minutesShort", { defaultValue: "min" })}</small></button>)}
          </div>
          <Button variant="secondary" icon="moon" onClick={() => void onAction({ action: "snooze", durationMinutes: minutesUntilLocalTomorrow() })}>{t("dashboard.quietToday", { defaultValue: "Quiet for the rest of today" })}</Button>
        </div>
      </section>
    </div>
  );
}

function BuddiesPage({ snapshot, onPatch, onNavigate }: PageProps) {
  const { t } = useTranslation();
  const selected = snapshot.settings.selectedPets;
  const toggleBuddy = (id: BuddyId) => {
    const next = selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id];
    if (next.length) onPatch({ selectedPets: next });
  };
  return (
    <div className="page">
      <PageHeader eyebrow={t("buddies.eyebrow", { defaultValue: "THE MISCHIEF DEPARTMENT" })} title={t("buddies.title", { defaultValue: "Meet the crew" })} description={t("buddies.description", { defaultValue: "Enable one favorite or let the whole team rotate through your day." })} action={<Toggle compact checked={snapshot.settings.selectedPets.length > 1} onChange={(rotate) => onPatch({ selectedPets: rotate ? BUDDIES.map((buddy) => buddy.id) : [snapshot.settings.selectedPets[0] ?? DEFAULT_BUDDY_ID] })} label={t("buddies.rotate", { defaultValue: "Rotate buddies" })} />} />
      <div className="crew-grid">
        {BUDDIES.map((buddy) => {
          const enabled = selected.includes(buddy.id);
          return (
            <article className={`crew-card ${enabled ? "is-enabled" : ""}`} style={{ "--choice-accent": buddy.accent, "--choice-soft": buddy.softAccent } as React.CSSProperties} key={buddy.id}>
              <div className="crew-card__art"><span className="crew-card__number">{buddy.number ? `#${buddy.number}` : "✦"}</span><BuddyCharacter buddyId={buddy.id} size="medium" mood="happy" /></div>
              <div className="crew-card__body"><div className="crew-card__title"><div><h2>{t(`pets.${buddy.id}.name`, { defaultValue: buddy.name })}</h2><p>{t(`pets.${buddy.id}.tagline`, { defaultValue: buddy.tagline })}</p></div><button className={`round-check ${enabled ? "is-on" : ""}`} type="button" aria-label={enabled ? t("buddies.disable", { defaultValue: "Disable {{name}}", name: t(`pets.${buddy.id}.name`, { defaultValue: buddy.name }) }) : t("buddies.enable", { defaultValue: "Enable {{name}}", name: t(`pets.${buddy.id}.name`, { defaultValue: buddy.name }) })} onClick={() => toggleBuddy(buddy.id)}><Icon name="check" size={15}/></button></div><div className="action-chips">{buddy.actions.map((action) => <span key={action}>{t(`actions.${action}`, { defaultValue: action })}</span>)}</div></div>
            </article>
          );
        })}
      </div>
      <div className="info-banner"><Icon name="info"/><span><strong>{t("buddies.oneAtATime", { defaultValue: "One troublemaker at a time." })}</strong> {t("buddies.oneAtATimeHelp", { defaultValue: "Even with rotation on, BuddyPet never stacks episodes or crowds your screen." })}</span><Button variant="ghost" size="small" onClick={() => onNavigate("playground")}>{t("buddies.tryThem", { defaultValue: "Try them all" })}</Button></div>
    </div>
  );
}

function MischiefPage({ snapshot, onPatch }: PageProps) {
  const { t } = useTranslation();
  const toggles: { key: keyof SettingsV1["behaviorToggles"]; icon: IconName; title: string; description: string; visual: string }[] = [
    { key: "fakeDamage", icon: "bolt", title: t("mischief.fakeDamage", { defaultValue: "Fake damage" }), description: t("mischief.fakeDamageHelp", { defaultValue: "Cartoon cracks, nibbled corners, folds, and scratches." }), visual: "⌁" },
    { key: "coverContent", icon: "eye", title: t("mischief.coverContent", { defaultValue: "Cover content" }), description: t("mischief.coverContentHelp", { defaultValue: "Loafing, sticky notes, and dramatic peeking near your work." }), visual: "▰" },
    { key: "cursorPlay", icon: "wand", title: t("mischief.cursorPlay", { defaultValue: "Cursor play" }), description: t("mischief.cursorPlayHelp", { defaultValue: "Chase a fake cursor nearby. Your real pointer never moves." }), visual: "↗" },
    { key: "sfx", icon: "volume", title: t("mischief.sfx", { defaultValue: "Prank sound effects" }), description: t("mischief.sfxHelp", { defaultValue: "Species sounds, tiny impacts, chimes, and theatrical squeaks." }), visual: "♪" },
  ];
  return (
    <div className="page">
      <PageHeader eyebrow={t("mischief.eyebrow", { defaultValue: "PICK YOUR POISON (NICELY)" })} title={t("mischief.title", { defaultValue: "Build the mischief deck" })} description={t("mischief.description", { defaultValue: "Turn entire groups of antics on or off. Changes apply to the next visit." })} />
      <div className="mischief-grid">
        {toggles.map((item) => <article className={`mischief-card ${snapshot.settings.behaviorToggles[item.key] ? "is-on" : ""}`} key={item.key}><div className="mischief-card__visual"><span>{item.visual}</span><Icon name={item.icon}/></div><Toggle checked={snapshot.settings.behaviorToggles[item.key]} onChange={(value) => onPatch({ behaviorToggles: { ...snapshot.settings.behaviorToggles, [item.key]: value } })} label={item.title} description={item.description}/></article>)}
      </div>
      <section className="panel-card safety-limits"><div className="card-heading"><div><p className="eyebrow">{t("mischief.nonNegotiable", { defaultValue: "NON-NEGOTIABLE" })}</p><h2>{t("mischief.guardrails", { defaultValue: "Built-in “don’t be annoying” limits" })}</h2></div><span className="shield-illustration"><Icon name="shield" size={32}/></span></div><div className="limit-grid"><Limit icon="clock" title={t("limits.duration", { defaultValue: "12 seconds max" })} text={t("limits.durationHelp", { defaultValue: "Every visit ends quickly." })}/><Limit icon="monitor" title={t("limits.area", { defaultValue: "12% of screen max" })} text={t("limits.areaHelp", { defaultValue: "Your work stays visible." })}/><Limit icon="x" title={t("limits.dismiss", { defaultValue: "Dismiss means less" })} text={t("limits.dismissHelp", { defaultValue: "Two early exits halve visits." })}/><Limit icon="lock" title={t("limits.real", { defaultValue: "Pixels, never files" })} text={t("limits.realHelp", { defaultValue: "Nothing real is touched." })}/></div></section>
    </div>
  );
}

function Limit({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  return <div className="limit-item"><span><Icon name={icon}/></span><div><strong>{title}</strong><small>{text}</small></div></div>;
}

function RoutinePage({ snapshot, onPatch, onAction }: PageProps) {
  const { t } = useTranslation();
  const [meetingDuration, setMeetingDuration] = useState("60");
  const intensityOptions: Intensity[] = ["gentle", "playful", "chaos"];
  return (
    <div className="page">
      <PageHeader eyebrow={t("routine.eyebrow", { defaultValue: "TIMING IS EVERYTHING" })} title={t("routine.title", { defaultValue: "Set a comfortable rhythm" })} description={t("routine.description", { defaultValue: "BuddyPet uses idle time and safety rules — never what you type or which app you use." })} />
      <section className="panel-card settings-section"><div className="card-heading"><div><h2>{t("routine.intensity", { defaultValue: "Visit intensity" })}</h2><p>{t("routine.intensityHelp", { defaultValue: "This controls timing and daily limits, not how kind Buddy is." })}</p></div></div><div className="segmented-picker segmented-picker--three">{intensityOptions.map((intensity) => <button type="button" className={snapshot.settings.intensity === intensity ? "is-active" : ""} onClick={() => onPatch({ intensity })} key={intensity}><Icon name={intensity === "gentle" ? "moon" : intensity === "playful" ? "sparkles" : "bolt"}/><span><strong>{t(`intensity.${intensity}`, { defaultValue: intensity })}</strong><small>{INTENSITY_META[intensity].range.replace(" min", "")} {t("common.minutesShort", { defaultValue: "min" })}</small></span></button>)}</div></section>
      <div className="two-column-settings">
        <section className="panel-card settings-section"><div className="card-heading"><div><h2>{t("routine.quietHours", { defaultValue: "Quiet hours" })}</h2><p>{t("routine.quietHoursHelp", { defaultValue: "No random or focus-triggered visits overnight." })}</p></div></div><Toggle compact checked={snapshot.settings.quietHours.enabled} onChange={(enabled) => onPatch({ quietHours: { ...snapshot.settings.quietHours, enabled } })} label={snapshot.settings.quietHours.enabled ? t("common.on", { defaultValue: "On" }) : t("common.off", { defaultValue: "Off" })}/><div className="time-fields"><label>{t("routine.from", { defaultValue: "From" })}<input type="time" value={minutesToTime(snapshot.settings.quietHours.startMinute)} disabled={!snapshot.settings.quietHours.enabled} onChange={(event) => onPatch({ quietHours: { ...snapshot.settings.quietHours, startMinute: timeToMinutes(event.target.value) } })}/></label><span>→</span><label>{t("routine.to", { defaultValue: "To" })}<input type="time" value={minutesToTime(snapshot.settings.quietHours.endMinute)} disabled={!snapshot.settings.quietHours.enabled} onChange={(event) => onPatch({ quietHours: { ...snapshot.settings.quietHours, endMinute: timeToMinutes(event.target.value) } })}/></label></div></section>
        <section className="panel-card settings-section meeting-card"><div className="card-heading"><div><h2>{t("routine.meetingMode", { defaultValue: "Meeting Mode" })}</h2><p>{t("routine.meetingHelp", { defaultValue: "Block all visits while you present or share your screen." })}</p></div><span className="meeting-icon"><Icon name="monitor"/></span></div><div className="meeting-control"><select aria-label={t("routine.meetingDuration", { defaultValue: "Meeting duration" })} value={meetingDuration} onChange={(event) => setMeetingDuration(event.target.value)}><option value="30">{t("routine.duration30", { defaultValue: "30 minutes" })}</option><option value="60">{t("routine.duration60", { defaultValue: "1 hour" })}</option><option value="120">{t("routine.duration120", { defaultValue: "2 hours" })}</option><option value="today">{t("routine.today", { defaultValue: "Rest of today" })}</option></select><Button icon="pause" onClick={() => void onAction({ action: "meeting", durationMinutes: meetingDuration === "today" ? minutesUntilLocalTomorrow() : Number(meetingDuration) })}>{t("routine.startMeeting", { defaultValue: "Start" })}</Button></div></section>
      </div>
      <div className="info-banner"><Icon name="shield"/><span><strong>{t("routine.automaticSafety", { defaultValue: "Automatic safety checks stay on." })}</strong> {t("routine.automaticSafetyHelp", { defaultValue: "BuddyPet also stays hidden during lock, sleep, fullscreen, and for five minutes after wake." })}</span></div>
    </div>
  );
}

function SoundPage({ snapshot, onPatch, onAction }: PageProps) {
  const { t } = useTranslation();
  const [voicePackState, setVoicePackState] = useState<VoicePackStatus | null>(null);
  const voicePack = voicePackState?.locale === snapshot.settings.locale ? voicePackState : null;

  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    void desktopBridge.getVoicePackStatus(snapshot.settings.locale).then((status) => {
      if (!disposed) setVoicePackState(status);
    });
    void desktopBridge.subscribeVoicePack((status) => {
      if (status.locale === snapshot.settings.locale) setVoicePackState(status);
    }).then((off) => {
      if (disposed) off();
      else unsubscribe = off;
    });
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [snapshot.settings.locale]);

  const installVoicePack = async () => {
    setVoicePackState((current) => current ? { ...current, state: "downloading", error: null } : current);
    try {
      setVoicePackState(await desktopBridge.installVoicePack(snapshot.settings.locale));
    } catch {
      setVoicePackState((current) => current ? { ...current, state: "error", error: "voicePackDownloadFailed" } : current);
    }
  };
  const progress = voicePack && voicePack.totalBytes > 0
    ? Math.min(100, Math.round(voicePack.downloadedBytes / voicePack.totalBytes * 100))
    : 0;
  return (
    <div className="page">
      <PageHeader eyebrow={t("sound.eyebrow", { defaultValue: "BLEATS, BOOPS & DRAMA" })} title={t("sound.title", { defaultValue: "Sound and motion" })} description={t("sound.description", { defaultValue: "Keep the personality, tune the volume, and calm down the movement." })} action={<Button variant="secondary" icon="headphones" disabled={!snapshot.settings.sound} onClick={() => void onAction({ action: "previewSound", petId: snapshot.settings.selectedPets[0] ?? DEFAULT_BUDDY_ID, text: t("sound.voicePreviewLine", { defaultValue: "Hey! Your Buddy voice is ready." }), locale: snapshot.settings.locale })}>{t("sound.preview", { defaultValue: "Preview sound" })}</Button>} />
      <section className="panel-card settings-section sound-panel"><div className="sound-panel__art"><span>♪</span><span>♫</span><BuddyCharacter buddyId={snapshot.settings.selectedPets[0] ?? DEFAULT_BUDDY_ID} size="small" mood="happy" decorative /></div><div className="sound-panel__controls"><Toggle checked={snapshot.settings.sound} onChange={(sound) => onPatch({ sound })} label={t("sound.effects", { defaultValue: "Buddy sounds" })} description={t("sound.effectsLong", { defaultValue: "Species sounds, footsteps, impacts, and gentle break chimes." })}/><Toggle checked={snapshot.settings.behaviorToggles.voice} disabled={!snapshot.settings.sound} onChange={(voice) => onPatch({ behaviorToggles: { ...snapshot.settings.behaviorToggles, voice } })} label={t("sound.voice", { defaultValue: "Read Buddy speech aloud" })} description={t("sound.voiceHelp", { defaultValue: "Uses the offline HD voice pack when installed, with the system voice as fallback." })}/><label className={`range-field ${!snapshot.settings.sound ? "is-disabled" : ""}`}><span><strong>{t("sound.volume", { defaultValue: "Volume" })}</strong><output>{snapshot.settings.soundVolume}%</output></span><input type="range" min="0" max="100" value={snapshot.settings.soundVolume} disabled={!snapshot.settings.sound} onChange={(event) => onPatch({ soundVolume: Number(event.target.value) })}/></label><div className="sound-note"><Icon name="info"/>{t("sound.localVoice", { defaultValue: "Voice playback stays on this device and reads only the visible bubble." })}</div></div></section>
      <section className="panel-card settings-section voice-pack-card">
        <div className="card-heading"><div><h2>{t("sound.voicePackTitle", { defaultValue: "Offline HD voice pack" })}</h2><p>{t("sound.voicePackHelp", { defaultValue: "Download only the pack for your selected language. Nothing is sent to the cloud." })}</p></div><Badge tone={voicePack?.state === "ready" ? "success" : voicePack?.state === "error" ? "warning" : "neutral"}>{voicePack?.state === "ready" ? t("sound.voicePackReady", { defaultValue: "Installed" }) : voicePack?.state === "downloading" || voicePack?.state === "installing" ? `${progress}%` : `${t("sound.voicePackOptional", { defaultValue: "Optional" })} · ${formatMegabytes(voicePack?.totalBytes ?? 0, snapshot.settings.locale)}`}</Badge></div>
        {(voicePack?.state === "downloading" || voicePack?.state === "installing") && <div className="voice-pack-progress"><span style={{ width: `${progress}%` }}/><small>{voicePack.state === "installing" ? t("sound.voicePackInstalling", { defaultValue: "Verifying and installing…" }) : t("sound.voicePackDownloading", { defaultValue: "Downloading securely…" })}</small></div>}
        {voicePack?.state !== "ready" && voicePack?.state !== "downloading" && voicePack?.state !== "installing" && <Button variant="secondary" icon="download" onClick={() => void installVoicePack()}>{voicePack?.state === "error" ? t("sound.voicePackRetry", { defaultValue: "Try download again" }) : t("sound.voicePackDownload", { defaultValue: "Download voice pack" })}</Button>}
        {voicePack && <div className={`voice-pack-details ${voicePack.state === "ready" ? "is-ready" : ""}`}><Icon name={voicePack.state === "ready" ? "check" : "info"}/><span><strong>{voicePack.name}</strong><small>{voicePack.engine} · {voicePack.license}</small><small>{t("sound.voicePackOffline", { defaultValue: "Runs locally after download; the operating-system voice remains available as fallback." })}</small></span></div>}
      </section>
      <section className="panel-card settings-section"><div className="card-heading"><div><h2>{t("motion.title", { defaultValue: "Motion comfort" })}</h2><p>{t("motion.description", { defaultValue: "BuddyPet never uses flashes or jump-scare audio." })}</p></div></div><Toggle checked={snapshot.settings.reduceMotion} onChange={(reduceMotion) => onPatch({ reduceMotion })} label={t("motion.reduce", { defaultValue: "Reduce motion" })} description={t("motion.reduceHelp", { defaultValue: "Replace running, jumping, screen shake, and particles with short fades." })}/></section>
    </div>
  );
}

function PrivacyPage({ snapshot, onPatch, onAction }: PageProps) {
  const { t } = useTranslation();
  return (
    <div className="page">
      <PageHeader eyebrow={t("privacy.eyebrow", { defaultValue: "PRIVATE BY DESIGN" })} title={t("privacy.title", { defaultValue: "Your desktop stays yours" })} description={t("privacy.description", { defaultValue: "BuddyPet runs offline and observes only how long it has been since the last input — never the input itself." })} />
      <section className="privacy-hero-card"><div><Badge tone="success"><Icon name="lock" size={13}/> {t("privacy.offlineBadge", { defaultValue: "Offline-first" })}</Badge><h2>{t("privacy.neverLeaves", { defaultValue: "Nothing about your work leaves this device." })}</h2><p>{t("privacy.neverLeavesHelp", { defaultValue: "No account, cloud AI, microphone, clipboard access, file scanning, keystroke logging, or accessibility tree." })}</p></div><div className="privacy-orbit"><span><Icon name="shield" size={38}/></span><i/><i/><i/></div></section>
      <section className="panel-card settings-section"><div className="card-heading"><div><h2>{t("privacy.immersive", { defaultValue: "Immersive visual pranks" })}</h2><p>{t("privacy.immersivePanelHelp", { defaultValue: "A single cropped frame makes a convincing bite or tear. It is released as soon as the effect ends." })}</p></div><Badge tone={snapshot.runtime.capturePermission === "granted" ? "success" : "neutral"}>{snapshot.runtime.capturePermission === "granted" ? t("privacy.permissionReady", { defaultValue: "Permission ready" }) : t("privacy.fallbackReady", { defaultValue: "Cartoon fallback ready" })}</Badge></div><Toggle checked={snapshot.settings.immersiveEnabled} onChange={(immersiveEnabled) => onPatch({ immersiveEnabled })} label={t("privacy.useCapture", { defaultValue: "Use cropped screen capture" })} description={t("privacy.captureLimits", { defaultValue: "Maximum 640 × 480 logical pixels, 12% of the screen, for 2.5 seconds." })}/>{snapshot.settings.immersiveEnabled && snapshot.runtime.capturePermission !== "granted" && <div className="permission-callout"><Icon name="monitor"/><span><strong>{t("privacy.permissionNeeded", { defaultValue: "Permission needed for immersive effects" })}</strong><small>{t("privacy.permissionOptional", { defaultValue: "BuddyPet still works without it using hand-drawn effects." })}</small></span><Button variant="secondary" size="small" onClick={() => void onAction({ action: "requestCapture" })}>{t("privacy.reviewAccess", { defaultValue: "Review access" })}</Button></div>}</section>
      <section className="data-grid"><DataCard icon="keyboard" title={t("privacy.activity", { defaultValue: "Activity timer" })} state={t("privacy.memoryOnly", { defaultValue: "Memory only" })} text={t("privacy.activityHelp", { defaultValue: "Checks input age every 10 seconds. No keys, clicks, or app names." })}/><DataCard icon="monitor" title={t("privacy.screenFrame", { defaultValue: "Screen frame" })} state={t("privacy.instantDelete", { defaultValue: "Instantly released" })} text={t("privacy.screenFrameHelp", { defaultValue: "Never encoded, logged, analyzed, or attached to reports." })}/><DataCard icon="shield" title={t("privacy.telemetry", { defaultValue: "Anonymous analytics" })} state={snapshot.settings.telemetryEnabled ? t("common.on", { defaultValue: "On" }) : t("common.off", { defaultValue: "Off" })} text={t("privacy.telemetryHelp", { defaultValue: "Optional event outcomes only. Off by default." })}><Toggle compact checked={snapshot.settings.telemetryEnabled} onChange={(telemetryEnabled) => onPatch({ telemetryEnabled })} label={t("privacy.share", { defaultValue: "Share anonymous outcomes" })}/></DataCard></section>
    </div>
  );
}

function DataCard({ icon, title, state, text, children }: { icon: IconName; title: string; state: string; text: string; children?: React.ReactNode }) {
  return <article className="data-card"><div className="data-card__icon"><Icon name={icon}/></div><span className="data-card__state">{state}</span><h3>{title}</h3><p>{text}</p>{children}</article>;
}

function AccessibilityPage({ snapshot, onPatch }: PageProps) {
  const { t } = useTranslation();
  const commitHotkey = (input: HTMLInputElement) => {
    const normalized = input.value
      .replaceAll(" ", "")
      .split("+")
      .map((part) => {
        const lower = part.toLowerCase();
        if (lower === "ctrl") return "Control";
        if (lower === "option") return "Alt";
        return part;
      })
      .join("+");
    if (normalized && normalized !== snapshot.settings.hotkey) {
      input.value = normalized;
      onPatch({ hotkey: normalized });
    } else {
      input.value = snapshot.settings.hotkey;
    }
  };

  return (
    <div className="page">
      <PageHeader eyebrow={t("accessibility.eyebrow", { defaultValue: "COMFORT COMES FIRST" })} title={t("accessibility.title", { defaultValue: "Accessibility" })} description={t("accessibility.description", { defaultValue: "Make BuddyPet calmer and keep every escape route easy to reach." })} />
      <div className="two-column-settings">
        <section className="panel-card settings-section"><div className="card-heading"><span className="section-icon"><Icon name="accessibility"/></span><div><h2>{t("accessibility.motion", { defaultValue: "Visual comfort" })}</h2><p>{t("accessibility.motionHelp", { defaultValue: "Movement can be simplified without losing character." })}</p></div></div><Toggle checked={snapshot.settings.reduceMotion} onChange={(reduceMotion) => onPatch({ reduceMotion })} label={t("motion.reduce", { defaultValue: "Reduce motion" })} description={t("motion.reduceShort", { defaultValue: "Use fades and poses instead of runs, jumps, and shake." })}/><div className="always-on-setting"><span><Icon name="shield"/><span><strong>{t("accessibility.flash", { defaultValue: "Flash protection" })}</strong><small>{t("accessibility.flashHelp", { defaultValue: "Strobing and jumpscares are never used." })}</small></span></span><Badge tone="success">{t("common.alwaysOn", { defaultValue: "Always on" })}</Badge></div></section>
        <section className="panel-card settings-section"><div className="card-heading"><span className="section-icon section-icon--orange"><Icon name="keyboard"/></span><div><h2>{t("accessibility.escape", { defaultValue: "Emergency shortcut" })}</h2><p>{t("accessibility.escapeHelp", { defaultValue: "Hide everything and take a 30-minute break from BuddyPet." })}</p></div></div><div className="hotkey-display"><input key={snapshot.settings.hotkey} aria-label={t("accessibility.hotkeyInput", { defaultValue: "Global emergency shortcut" })} spellCheck={false} defaultValue={snapshot.settings.hotkey} onBlur={(event) => commitHotkey(event.currentTarget)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}/><Badge tone="neutral">{t("accessibility.global", { defaultValue: "Global" })}</Badge></div><p className="field-help">{t("accessibility.hotkeyNote", { defaultValue: "Use a chord such as Control+Alt+B. BuddyPet records only the shortcut itself, never what you type." })}</p></section>
      </div>
      <section className="panel-card settings-section language-settings"><div className="card-heading"><span className="section-icon"><Icon name="globe"/></span><div><h2>{t("accessibility.language", { defaultValue: "Language & text" })}</h2><p>{t("accessibility.languageHelp", { defaultValue: "Change settings, Buddy speech, and tray labels together." })}</p></div></div><div className="language-picker">{([
        ["vi", "VI", "Tiếng Việt"],
        ["en", "EN", "English"],
        ["ko", "KO", "한국어"],
        ["ja", "JA", "日本語"],
      ] as const satisfies readonly (readonly [Locale, string, string])[]).map(([locale, code, label]) => <button type="button" className={snapshot.settings.locale === locale ? "is-active" : ""} aria-pressed={snapshot.settings.locale === locale} onClick={() => onPatch({ locale })} key={locale}><span>{code}</span><strong>{label}</strong>{snapshot.settings.locale === locale && <Icon name="check"/>}</button>)}</div></section>
      <section className="panel-card settings-section"><div className="card-heading"><div><h2>{t("accessibility.interaction", { defaultValue: "Predictable interaction" })}</h2><p>{t("accessibility.interactionHelp", { defaultValue: "The same gestures always have the same result." })}</p></div></div><div className="gesture-grid"><Gesture symbol="↖" title={t("gestures.click", { defaultValue: "Click once" })} text={t("gestures.clickHelp", { defaultValue: "Buddy reacts and hops away." })}/><Gesture symbol="×2" title={t("gestures.double", { defaultValue: "Click again" })} text={t("gestures.doubleHelp", { defaultValue: "The visit ends immediately." })}/><Gesture symbol="♡" title={t("gestures.hold", { defaultValue: "Hold for 0.7s" })} text={t("gestures.holdHelp", { defaultValue: "Pet Buddy and soften the reaction." })}/><Gesture symbol="⋮" title={t("gestures.right", { defaultValue: "Right-click" })} text={t("gestures.rightHelp", { defaultValue: "Hide, snooze, or see less." })}/></div></section>
    </div>
  );
}

function Gesture({ symbol, title, text }: { symbol: string; title: string; text: string }) {
  return <div className="gesture"><span>{symbol}</span><div><strong>{title}</strong><small>{text}</small></div></div>;
}

function PlaygroundPage({ snapshot, onAction }: PageProps) {
  const { t } = useTranslation();
  const [buddyId, setBuddyId] = useState<BuddyId>(snapshot.settings.selectedPets[0] ?? DEFAULT_BUDDY_ID);
  const [tone, setTone] = useState<Tone>(snapshot.settings.tone);
  const [actionId, setActionId] = useState(BUDDIES.find((item) => item.id === buddyId)?.actions[0] ?? DEFAULT_BUDDY_ACTION_ID);
  const [mood, setMood] = useState<BuddyMood>("idle");
  const [playing, setPlaying] = useState(false);
  const buddy = useMemo(() => BUDDIES.find((item) => item.id === buddyId) ?? DEFAULT_BUDDY, [buddyId]);

  const chooseBuddy = (nextBuddyId: BuddyId) => {
    setBuddyId(nextBuddyId);
    setActionId(BUDDIES.find((item) => item.id === nextBuddyId)?.actions[0] ?? DEFAULT_BUDDY_ACTION_ID);
  };

  const play = () => {
    setPlaying(true);
    setMood("enter");
    window.setTimeout(() => setMood("prank"), 450);
    window.setTimeout(() => setMood("happy"), 1500);
    window.setTimeout(() => { setMood("idle"); setPlaying(false); }, 2350);
    void onAction({ action: "previewAction", petId: buddyId, actionId });
  };

  return (
    <div className="page page--playground">
      <PageHeader eyebrow={t("playground.eyebrow", { defaultValue: "NO-Consequences ZONE" })} title={t("playground.title", { defaultValue: "The mischief playground" })} description={t("playground.description", { defaultValue: "Preview a Buddy and action here. Test runs never count toward your daily limit." })} />
      <section className="playground-layout">
        <div className="playground-stage">
          <div className="playground-window"><div className="fake-toolbar"><i/><i/><i/><span>{t("playground.screenSample", { defaultValue: "Any active app • browser • editor • video" })}</span></div><div className="playground-document"><span/><span/><span/><span/><span/></div><div className={`playground-effect effect-${actionId}`}/></div>
          <div className="playground-buddy"><BuddyCharacter buddyId={buddyId} size="stage" mood={mood}/><div className={`playground-bubble ${mood === "prank" || mood === "happy" ? "is-visible" : ""}`}>{tone === "sassy" ? t(`playground.lines.${buddyId}.sassy`, { defaultValue: "Interesting pixels. Mine now." }) : t(`playground.lines.${buddyId}.kind`, { defaultValue: "Tiny renovation! You’re welcome." })}</div></div>
          <span className="playground-floor"/>
        </div>
        <aside className="playground-controls panel-card">
          <div><label>{t("playground.buddy", { defaultValue: "Buddy" })}</label><div className="mini-buddy-picker">{BUDDIES.map((item) => <button type="button" className={buddyId === item.id ? "is-active" : ""} aria-label={t(`pets.${item.id}.name`, { defaultValue: item.name })} onClick={() => chooseBuddy(item.id)} key={item.id}><BuddyCharacter buddyId={item.id} size="tiny" decorative/></button>)}</div></div>
          <div><label htmlFor="playground-action">{t("playground.action", { defaultValue: "Signature action" })}</label><select id="playground-action" value={actionId} onChange={(event) => setActionId(event.target.value)}>{buddy.actions.map((action) => <option value={action} key={action}>{t(`actions.${action}`, { defaultValue: action.replace(/([A-Z])/g, " $1") })}</option>)}</select></div>
          <div><label>{t("playground.tone", { defaultValue: "Speech tone" })}</label><div className="small-segments"><button type="button" className={tone === "kind" ? "is-active" : ""} onClick={() => setTone("kind")}>{t("tone.kindShort", { defaultValue: "Sweet" })}</button><button type="button" className={tone === "sassy" ? "is-active" : ""} onClick={() => setTone("sassy")}>{t("tone.sassyShort", { defaultValue: "Sassy" })}</button></div></div>
          <Button size="large" icon="play" disabled={playing} onClick={play}>{playing ? t("playground.playing", { defaultValue: "Making trouble…" }) : t("playground.preview", { defaultValue: "Preview on stage" })}</Button>
          <p><Icon name="info" size={15}/>{t("playground.safe", { defaultValue: "This is a contained preview. Nothing appears over other apps." })}</p>
        </aside>
      </section>
    </div>
  );
}
