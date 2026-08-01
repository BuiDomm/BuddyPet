import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "../../components/Badge";
import { BuddyCharacter, type BuddyMood } from "../../components/BuddyCharacter";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { Toggle } from "../../components/Toggle";
import { BUDDIES, INTENSITY_META } from "../domain/defaults";
import { BUDDY_IDS, DEFAULT_BUDDY_ID, type ActionRequest, type BuddyId, type Intensity, type Locale, type SettingsV1, type Tone } from "../domain/types";

const LOCALES: { id: Locale; name: string; nativeName: string; sample: string }[] = [
  { id: "vi", name: "Vietnamese", nativeName: "Tiếng Việt", sample: "Nghỉ một chút nhé?" },
  { id: "en", name: "English", nativeName: "English", sample: "Tiny break, big comeback!" },
  { id: "ko", name: "Korean", nativeName: "한국어", sample: "잠깐 쉬어 갈까요?" },
  { id: "ja", name: "Japanese", nativeName: "日本語", sample: "ちょっと休憩しよう！" },
];

const STEPS = ["crew", "personality", "rhythm", "privacy", "ready"] as const;

interface OnboardingProps {
  initialSettings: SettingsV1;
  capturePermission: "unknown" | "granted" | "denied" | "unavailable";
  onAction: (request: ActionRequest) => Promise<void>;
  onComplete: (settings: SettingsV1) => Promise<void>;
}

function SelectMark() {
  return <span className="select-mark"><Icon name="check" size={14} /></span>;
}

export function Onboarding({ initialSettings, capturePermission, onAction, onComplete }: OnboardingProps) {
  const { t, i18n } = useTranslation();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(initialSettings);
  const [finishing, setFinishing] = useState(false);
  const progress = ((step + 1) / STEPS.length) * 100;

  const selectLocale = (locale: Locale) => {
    setDraft((current) => ({ ...current, locale }));
    void i18n.changeLanguage(locale);
  };

  const selectBuddy = (buddyId: BuddyId) => {
    setDraft((current) => ({ ...current, selectedPets: [buddyId] }));
  };

  const finish = async () => {
    setFinishing(true);
    try {
      await onComplete({ ...draft, onboardingCompleted: true });
    } finally {
      setFinishing(false);
    }
  };

  return (
    <main className="onboarding-shell">
      <header className="onboarding-topbar">
        <div className="brand-mark" aria-label="BuddyPet">
          <span className="brand-mark__face">B</span>
          <span>BuddyPet</span>
          <Badge tone="purple">{t("common.earlyAccess", { defaultValue: "EARLY ACCESS" })}</Badge>
        </div>
        <span className="onboarding-topbar__step">
          {t("onboarding.step", { defaultValue: "Step {{current}} of {{total}}", current: step + 1, total: STEPS.length })}
        </span>
      </header>

      <div className="onboarding-progress" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>

      <section className="onboarding-content" aria-live="polite">
        {step === 0 && (
          <CrewStep draft={draft} onLocale={selectLocale} onBuddy={selectBuddy} onChange={setDraft} t={t} />
        )}
        {step === 1 && <PersonalityStep draft={draft} onChange={setDraft} t={t} />}
        {step === 2 && <RhythmStep draft={draft} onChange={setDraft} t={t} />}
        {step === 3 && (
          <PrivacyStep draft={draft} capturePermission={capturePermission} onChange={setDraft} onAction={onAction} t={t} />
        )}
        {step === 4 && <ReadyStep draft={draft} onChange={setDraft} onAction={onAction} t={t} />}
      </section>

      <footer className="onboarding-footer">
        <div>
          {step > 0 && (
            <Button variant="ghost" icon="chevronLeft" onClick={() => setStep((value) => value - 1)}>
              {t("common.back", { defaultValue: "Back" })}
            </Button>
          )}
        </div>
        {step < STEPS.length - 1 ? (
          <Button size="large" trailingIcon="chevronRight" onClick={() => setStep((value) => value + 1)}>
            {t("common.continue", { defaultValue: "Continue" })}
          </Button>
        ) : (
          <Button size="large" icon="sparkles" disabled={finishing} onClick={() => void finish()}>
            {finishing
              ? t("onboarding.waking", { defaultValue: "Waking your buddy…" })
              : t("onboarding.finish", { defaultValue: "Let the mischief begin" })}
          </Button>
        )}
      </footer>
    </main>
  );
}

type TFunction = ReturnType<typeof useTranslation>["t"];

function OnboardingHeading({ kicker, title, description }: { kicker: string; title: string; description: string }) {
  return (
    <div className="onboarding-heading">
      <p className="eyebrow">{kicker}</p>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}

function CrewStep({ draft, onLocale, onBuddy, onChange, t }: {
  draft: SettingsV1;
  onLocale: (locale: Locale) => void;
  onBuddy: (buddyId: BuddyId) => void;
  onChange: (settings: SettingsV1) => void;
  t: TFunction;
}) {
  return (
    <div className="onboarding-step onboarding-step--wide">
      <OnboardingHeading
        kicker={t("onboarding.crew.kicker", { defaultValue: "First introductions" })}
        title={t("onboarding.crew.title", { defaultValue: "Choose your tiny troublemaker" })}
        description={t("onboarding.crew.description", { defaultValue: "Pick a language and the buddy who gets first dibs on your desktop." })}
      />

      <div className="setup-section">
        <div className="setup-section__heading">
          <span className="setup-number">1</span>
          <div><h2>{t("onboarding.language.title", { defaultValue: "Your language" })}</h2><p>{t("onboarding.language.help", { defaultValue: "You can switch this anytime." })}</p></div>
        </div>
        <div className="locale-grid" role="radiogroup" aria-label={t("onboarding.language.title", { defaultValue: "Your language" })}>
          {LOCALES.map((locale) => (
            <button
              type="button"
              role="radio"
              aria-checked={draft.locale === locale.id}
              className={`locale-card ${draft.locale === locale.id ? "is-selected" : ""}`}
              key={locale.id}
              onClick={() => onLocale(locale.id)}
            >
              <span className="locale-card__flag" aria-hidden="true">{locale.id.toUpperCase()}</span>
              <span><strong>{locale.nativeName}</strong><small>{locale.sample}</small></span>
              {draft.locale === locale.id && <SelectMark />}
            </button>
          ))}
        </div>
      </div>

      <div className="setup-section">
        <div className="setup-section__heading setup-section__heading--split">
          <span className="setup-number">2</span>
          <div><h2>{t("onboarding.buddy.title", { defaultValue: "Your first buddy" })}</h2><p>{t("onboarding.buddy.help", { defaultValue: "They all play differently." })}</p></div>
          <label className="inline-check">
            <input
              type="checkbox"
              checked={draft.selectedPets.length > 1}
              onChange={(event) => onChange({
                ...draft,
                selectedPets: event.target.checked ? [...BUDDY_IDS] : [draft.selectedPets[0] ?? DEFAULT_BUDDY_ID],
              })}
            />
            <Icon name="rotate" size={16} />
            {t("onboarding.buddy.rotate", { defaultValue: "Surprise me each time" })}
          </label>
        </div>
        <div className="buddy-picker" role="radiogroup" aria-label={t("onboarding.buddy.title", { defaultValue: "Your first buddy" })}>
          {BUDDIES.map((buddy) => {
            const selected = draft.selectedPets.includes(buddy.id);
            return (
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                className={`buddy-choice ${selected ? "is-selected" : ""}`}
                style={{ "--choice-accent": buddy.accent, "--choice-soft": buddy.softAccent } as React.CSSProperties}
                key={buddy.id}
                onClick={() => onBuddy(buddy.id)}
              >
                <BuddyCharacter buddyId={buddy.id} size="small" decorative />
                <span className="buddy-choice__copy"><strong>{t(`pets.${buddy.id}.name`, { defaultValue: buddy.name })}</strong><small>{t(`pets.${buddy.id}.tagline`, { defaultValue: buddy.tagline })}</small></span>
                {selected && <SelectMark />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PersonalityStep({ draft, onChange, t }: { draft: SettingsV1; onChange: (settings: SettingsV1) => void; t: TFunction }) {
  const activeBuddy = draft.selectedPets[0] ?? DEFAULT_BUDDY_ID;
  const lines: Record<Tone, string[]> = {
    kind: [
      t("dialogue.kind.1", { defaultValue: "Your shoulders called. They want a tiny stretch." }),
      t("dialogue.kind.2", { defaultValue: "I saved your spot. Go get some water!" }),
    ],
    sassy: [
      t("dialogue.sassy.1", { defaultValue: "That tab has seen enough of you for now." }),
      t("dialogue.sassy.2", { defaultValue: "Bold strategy. Zero breaks. Let me fix that." }),
    ],
  };

  return (
    <div className="onboarding-step">
      <OnboardingHeading
        kicker={t("onboarding.personality.kicker", { defaultValue: "Personality check" })}
        title={t("onboarding.personality.title", { defaultValue: "How should your buddy tease you?" })}
        description={t("onboarding.personality.description", { defaultValue: "Both styles stay friendly. No guilt trips, insults, or productivity lectures." })}
      />
      <div className="tone-stage">
        <div className="tone-stage__buddy"><BuddyCharacter buddyId={activeBuddy} size="large" mood={draft.tone === "sassy" ? "prank" : "happy"} /></div>
        <div className="tone-stage__bubbles">
          {lines[draft.tone].map((line, index) => <div className={`speech-preview speech-preview--${index + 1}`} key={line}>{line}</div>)}
        </div>
      </div>
      <div className="choice-grid choice-grid--two" role="radiogroup" aria-label={t("onboarding.personality.title", { defaultValue: "Buddy personality" })}>
        <ToneCard id="kind" selected={draft.tone === "kind"} icon="heart" title={t("tone.kind", { defaultValue: "Sweet & silly" })} description={t("tone.kind.description", { defaultValue: "Gentle nudges, happy dances, and cozy encouragement." })} onClick={() => onChange({ ...draft, tone: "kind" })} />
        <ToneCard id="sassy" selected={draft.tone === "sassy"} icon="bolt" title={t("tone.sassy", { defaultValue: "Playfully sassy" })} description={t("tone.sassy.description", { defaultValue: "Cheeky comments and a little more theatrical mischief." })} onClick={() => onChange({ ...draft, tone: "sassy" })} />
      </div>
      <div className="kindness-note"><Icon name="shield" /><span><strong>{t("onboarding.personality.promise", { defaultValue: "The kindness promise" })}</strong>{t("onboarding.personality.promiseText", { defaultValue: " BuddyPet never shames your work habits and learns when to back off." })}</span></div>
    </div>
  );
}

function ToneCard({ id, selected, icon, title, description, onClick }: { id: Tone; selected: boolean; icon: "heart" | "bolt"; title: string; description: string; onClick: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={selected} className={`large-choice ${selected ? "is-selected" : ""}`} onClick={onClick} data-tone={id}>
      <span className="large-choice__icon"><Icon name={icon} /></span>
      <span><strong>{title}</strong><small>{description}</small></span>
      {selected && <SelectMark />}
    </button>
  );
}

function RhythmStep({ draft, onChange, t }: { draft: SettingsV1; onChange: (settings: SettingsV1) => void; t: TFunction }) {
  const options: { id: Intensity; icon: "moon" | "sparkles" | "bolt"; title: string; label?: string; description: string }[] = [
    { id: "gentle", icon: "moon", title: t("intensity.gentle", { defaultValue: "Gentle" }), description: t("intensity.gentle.description", { defaultValue: "Quiet company with rare, tiny interruptions." }) },
    { id: "playful", icon: "sparkles", title: t("intensity.playful", { defaultValue: "Playful" }), label: t("common.recommended", { defaultValue: "Recommended" }), description: t("intensity.playful.description", { defaultValue: "A balanced dose of jokes, movement, and breaks." }) },
    { id: "chaos", icon: "bolt", title: t("intensity.chaos", { defaultValue: "Chaos" }), description: t("intensity.chaos.description", { defaultValue: "More entrances and bolder pranks, within safe limits." }) },
  ];

  return (
    <div className="onboarding-step">
      <OnboardingHeading
        kicker={t("onboarding.rhythm.kicker", { defaultValue: "Set the rhythm" })}
        title={t("onboarding.rhythm.title", { defaultValue: "How lively should your desktop feel?" })}
        description={t("onboarding.rhythm.description", { defaultValue: "Frequency automatically drops when you dismiss BuddyPet early." })}
      />
      <div className="intensity-grid" role="radiogroup" aria-label={t("onboarding.rhythm.title", { defaultValue: "Mischief intensity" })}>
        {options.map((option) => {
          const meta = INTENSITY_META[option.id];
          const selected = draft.intensity === option.id;
          return (
            <button type="button" role="radio" aria-checked={selected} className={`intensity-card intensity-card--${option.id} ${selected ? "is-selected" : ""}`} onClick={() => onChange({ ...draft, intensity: option.id })} key={option.id}>
              <span className="intensity-card__icon"><Icon name={option.icon} size={25} /></span>
              {option.label && <Badge tone="purple">{option.label}</Badge>}
              <strong>{option.title}</strong>
              <p>{option.description}</p>
              <div className="intensity-card__stats">
                <span><small>{t("intensity.random", { defaultValue: "Random visits" })}</small><b>{meta.range.replace(" min", "")} {t("common.minutesShort", { defaultValue: "min" })}</b></span>
                <span><small>{t("intensity.daily", { defaultValue: "Daily max" })}</small><b>{meta.daily}</b></span>
              </div>
              {selected && <SelectMark />}
            </button>
          );
        })}
      </div>
      <div className="rhythm-safety">
        <div><Icon name="clock" /><span><strong>{t("onboarding.rhythm.quiet", { defaultValue: "Quiet by default" })}</strong><small>{t("onboarding.rhythm.quietText", { defaultValue: "No surprises from 22:00 to 08:00, during fullscreen, or right after wake." })}</small></span></div>
        <div><Icon name="coffee" /><span><strong>{t("onboarding.rhythm.escape", { defaultValue: "One-tap escape hatch" })}</strong><small>{t("onboarding.rhythm.escapeText", { defaultValue: "Your hide shortcut clears every effect in under a second." })}</small></span></div>
      </div>
    </div>
  );
}

function PrivacyStep({ draft, capturePermission, onChange, onAction, t }: {
  draft: SettingsV1;
  capturePermission: "unknown" | "granted" | "denied" | "unavailable";
  onChange: (settings: SettingsV1) => void;
  onAction: (request: ActionRequest) => Promise<void>;
  t: TFunction;
}) {
  const effectivePermission = capturePermission;
  return (
    <div className="onboarding-step onboarding-step--privacy">
      <OnboardingHeading
        kicker={t("onboarding.privacy.kicker", { defaultValue: "Make-believe damage only" })}
        title={t("onboarding.privacy.title", { defaultValue: "A prank that forgets what it saw" })}
        description={t("onboarding.privacy.description", { defaultValue: "Immersive mode borrows one tiny screen region to make a convincing tear or bite. It never keeps the image." })}
      />
      <div className="privacy-demo">
        <div className="privacy-demo__screen">
          <div className="fake-toolbar"><i /><i /><i /></div>
          <div className="fake-document"><span /><span /><span /><span /></div>
          <div className="fake-bite"><b /><b /><b /></div>
          <BuddyCharacter buddyId={draft.selectedPets[0] ?? DEFAULT_BUDDY_ID} size="medium" mood="prank" decorative />
        </div>
        <div className="privacy-demo__flow">
          <span>{t("onboarding.privacy.capture", { defaultValue: "Tiny region" })}</span><Icon name="chevronRight"/><span>{t("onboarding.privacy.memory", { defaultValue: "Memory only" })}</span><Icon name="chevronRight"/><span>{t("onboarding.privacy.gone", { defaultValue: "Gone after prank" })}</span>
        </div>
      </div>
      <div className="privacy-controls panel-card">
        <Toggle checked={draft.immersiveEnabled} onChange={(immersiveEnabled) => onChange({ ...draft, immersiveEnabled })} label={t("privacy.immersive", { defaultValue: "Immersive visual pranks" })} description={t("privacy.immersiveHelp", { defaultValue: "Use one cropped frame for up to 2.5 seconds. Generic cartoons are used if unavailable." })} />
        {draft.immersiveEnabled && (
          <div className="permission-row">
            <div className={`permission-status permission-status--${effectivePermission}`}><Icon name={effectivePermission === "granted" ? "check" : "monitor"}/><span><strong>{effectivePermission === "granted" ? t("privacy.ready", { defaultValue: "Permission ready" }) : t("privacy.permission", { defaultValue: "Screen Recording permission" })}</strong><small>{t("privacy.permissionHelp", { defaultValue: "macOS asks once. Windows uses your consent here." })}</small></span></div>
            <Button variant="secondary" onClick={() => void onAction({ action: "requestCapture" })}>{effectivePermission === "granted" ? t("common.done", { defaultValue: "Done" }) : t("privacy.allow", { defaultValue: "Allow access" })}</Button>
          </div>
        )}
      </div>
      <div className="privacy-facts">
        <span><Icon name="lock" />{t("privacy.noDisk", { defaultValue: "Nothing written to disk" })}</span>
        <span><Icon name="eyeOff" />{t("privacy.noReading", { defaultValue: "No OCR or content reading" })}</span>
        <span><Icon name="shield" />{t("privacy.offline", { defaultValue: "100% offline" })}</span>
      </div>
    </div>
  );
}

function ReadyStep({ draft, onChange, onAction, t }: { draft: SettingsV1; onChange: (settings: SettingsV1) => void; onAction: (request: ActionRequest) => Promise<void>; t: TFunction }) {
  const [mood, setMood] = useState<BuddyMood>("idle");
  const [practiced, setPracticed] = useState(false);
  const activeBuddy = useMemo(() => draft.selectedPets[0] ?? DEFAULT_BUDDY_ID, [draft.selectedPets]);

  const practiceClick = () => {
    setPracticed(true);
    setMood("startled");
    void onAction({ action: "previewSound" });
    window.setTimeout(() => setMood("happy"), 650);
  };

  return (
    <div className="onboarding-step">
      <OnboardingHeading
        kicker={t("onboarding.ready.kicker", { defaultValue: "Almost there" })}
        title={t("onboarding.ready.title", { defaultValue: "Meet your new desktop roommate" })}
        description={t("onboarding.ready.description", { defaultValue: "Try the emergency interaction, then choose how BuddyPet starts." })}
      />
      <div className="ready-layout">
        <div className="practice-stage">
          <span className="practice-stage__hint">{practiced ? t("onboarding.ready.nice", { defaultValue: "Perfect — Buddy got the message!" }) : t("onboarding.ready.try", { defaultValue: "Click your buddy" })}</span>
          <button type="button" className="practice-pet" aria-label={t("onboarding.ready.clickBuddy", { defaultValue: "Practice clicking your buddy" })} onClick={practiceClick}>
            <BuddyCharacter buddyId={activeBuddy} size="large" mood={mood} />
          </button>
          <div className={`practice-bubble ${practiced ? "is-visible" : ""}`}>{draft.tone === "sassy" ? t("onboarding.ready.sassyLine", { defaultValue: "HEY! I was improving that pixel." }) : t("onboarding.ready.kindLine", { defaultValue: "Eep! Okay, okay — I’m moving!" })}</div>
        </div>
        <div className="ready-options panel-card">
          <Toggle checked={draft.sound} onChange={(sound) => { onChange({ ...draft, sound }); if (sound) void onAction({ action: "previewSound", petId: draft.selectedPets[0] ?? DEFAULT_BUDDY_ID, text: t("sound.voicePreviewLine", { defaultValue: "Hey! Your Buddy voice is ready." }), locale: draft.locale }); }} label={t("sound.effects", { defaultValue: "Buddy sounds" })} description={t("sound.effectsHelp", { defaultValue: "Tiny bleats, squeaks, chimes, and dramatic gasps." })} />
          <Toggle checked={draft.autostart} onChange={(autostart) => onChange({ ...draft, autostart })} label={t("startup.launch", { defaultValue: "Open BuddyPet at login" })} description={t("startup.launchHelp", { defaultValue: "Starts quietly in the menu bar or system tray." })} />
          <div className="shortcut-card"><span><Icon name="keyboard"/><span><strong>{t("shortcut.hide", { defaultValue: "Emergency hide" })}</strong><small>{t("shortcut.hideHelp", { defaultValue: "Clears Buddy and pauses surprises for 30 minutes." })}</small></span></span><kbd>{draft.hotkey}</kbd></div>
        </div>
      </div>
      <p className="ready-reassurance"><Icon name="heart" size={16}/>{t("onboarding.ready.reassurance", { defaultValue: "Your first visit is a gentle tutorial — no surprise attacks yet." })}</p>
    </div>
  );
}
