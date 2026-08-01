import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { BuddyCharacter } from "../../components/BuddyCharacter";
import { Button } from "../../components/Button";
import { Icon, type IconName } from "../../components/Icon";
import { BUDDIES, DEFAULT_BUDDY } from "../domain/defaults";
import type { ActionRequest, AppSnapshot, Locale, NavigationSection, SettingsV1 } from "../domain/types";
import { SettingsPage } from "./SettingsPages";

interface SettingsAppProps {
  snapshot: AppSnapshot;
  saving: boolean;
  saveError: string | null;
  onPatch: (patch: Partial<SettingsV1>) => void;
  onAction: (request: ActionRequest) => Promise<void>;
}

const NAV_ITEMS: { id: NavigationSection; icon: IconName; key: string; fallback: string }[] = [
  { id: "home", icon: "home", key: "navigation.home", fallback: "Home" },
  { id: "buddies", icon: "paw", key: "navigation.buddies", fallback: "Buddy crew" },
  { id: "mischief", icon: "sparkles", key: "navigation.mischief", fallback: "Mischief" },
  { id: "routine", icon: "clock", key: "navigation.routine", fallback: "Routine" },
  { id: "sound", icon: "volume", key: "navigation.sound", fallback: "Sound & motion" },
  { id: "privacy", icon: "shield", key: "navigation.privacy", fallback: "Privacy" },
  { id: "accessibility", icon: "accessibility", key: "navigation.accessibility", fallback: "Accessibility" },
  { id: "playground", icon: "play", key: "navigation.playground", fallback: "Playground" },
];

const QUICK_LOCALES = [
  ["vi", "Tiếng Việt"],
  ["en", "English"],
  ["ko", "한국어"],
  ["ja", "日本語"],
] as const satisfies readonly (readonly [Locale, string])[];

export function SettingsApp({ snapshot, saving, saveError, onPatch, onAction }: SettingsAppProps) {
  const { t, i18n } = useTranslation();
  const [section, setSection] = useState<NavigationSection>("home");
  const [summoning, setSummoning] = useState(false);
  const pageScroll = useRef<HTMLDivElement>(null);
  const activeBuddy = BUDDIES.find((buddy) => buddy.id === snapshot.settings.selectedPets[0]) ?? DEFAULT_BUDDY;

  useEffect(() => {
    const handleHash = () => {
      const candidate = window.location.hash.slice(1) as NavigationSection;
      if (NAV_ITEMS.some((item) => item.id === candidate)) setSection(candidate);
    };
    handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  useEffect(() => {
    if (pageScroll.current) pageScroll.current.scrollTop = 0;
  }, [section]);

  const navigate = (next: NavigationSection) => {
    setSection(next);
    window.history.replaceState(null, "", `#${next}`);
  };

  const summon = async () => {
    setSummoning(true);
    try {
      await onAction({ action: "previewAction", petId: activeBuddy.id, actionId: activeBuddy.actions[0] });
    } finally {
      window.setTimeout(() => setSummoning(false), 500);
    }
  };

  const chooseLocale = (event: ChangeEvent<HTMLSelectElement>) => {
    const locale = event.target.value as Locale;
    void i18n.changeLanguage(locale);
    onPatch({ locale });
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <span className="brand-mark__face">B</span>
          <span className="sidebar__brand-copy"><strong>BuddyPet</strong><small>{t("app.subtitle", { defaultValue: "desktop companion" })}</small></span>
        </div>

        <nav className="sidebar__nav" aria-label={t("navigation.label", { defaultValue: "BuddyPet settings" })}>
          <span className="sidebar__section-label">{t("navigation.yourBuddyPet", { defaultValue: "YOUR BUDDYPET" })}</span>
          {NAV_ITEMS.slice(0, 4).map((item) => <NavButton item={item} active={section === item.id} onClick={() => navigate(item.id)} t={t} key={item.id} />)}
          <span className="sidebar__section-label">{t("navigation.preferences", { defaultValue: "PREFERENCES" })}</span>
          {NAV_ITEMS.slice(4, 7).map((item) => <NavButton item={item} active={section === item.id} onClick={() => navigate(item.id)} t={t} key={item.id} />)}
          <span className="sidebar__section-label">{t("navigation.testLab", { defaultValue: "TEST LAB" })}</span>
          {NAV_ITEMS.slice(7).map((item) => <NavButton item={item} active={section === item.id} onClick={() => navigate(item.id)} t={t} key={item.id} />)}
        </nav>

        <div className="sidebar__buddy-card">
          <BuddyCharacter buddyId={activeBuddy.id} size="tiny" decorative />
          <span><strong>{t(`pets.${activeBuddy.id}.name`, { defaultValue: activeBuddy.name })}</strong><small>{snapshot.runtime.paused ? t("status.paused", { defaultValue: "Taking a nap" }) : t("status.ready", { defaultValue: "Ready for mischief" })}</small></span>
          <span className={`presence-dot ${snapshot.runtime.paused ? "is-paused" : ""}`} />
        </div>
      </aside>

      <section className="app-main">
        <header className="app-toolbar">
          <div className={`live-status ${snapshot.runtime.paused ? "is-paused" : ""}`}>
            <span />
            {snapshot.runtime.paused ? t("status.paused", { defaultValue: "Paused" }) : t("status.running", { defaultValue: "Running quietly" })}
          </div>
          <div className="app-toolbar__actions">
            <span className={`save-status ${saving ? "is-saving" : ""} ${saveError ? "is-error" : ""}`} title={saveError ?? undefined}>{saving ? t("status.saving", { defaultValue: "Saving…" }) : saveError ? t("status.saveFailed", { defaultValue: "Could not save" }) : t("status.saved", { defaultValue: "Saved" })}</span>
            <div className="quick-language">
              <Icon name="globe" size={15}/>
              <select
                value={snapshot.settings.locale}
                aria-label={t("language.quick", { defaultValue: "Change language" })}
                onChange={chooseLocale}
              >
                {QUICK_LOCALES.map(([locale, label]) => (
                  <option value={locale} key={locale}>{label}</option>
                ))}
              </select>
            </div>
            <Button variant="secondary" size="small" icon={snapshot.runtime.paused ? "play" : "pause"} onClick={() => void onAction({ action: snapshot.runtime.paused ? "resume" : "pause" })}>
              {snapshot.runtime.paused ? t("common.resume", { defaultValue: "Resume" }) : t("common.pause", { defaultValue: "Pause" })}
            </Button>
            <Button size="small" icon="wand" disabled={snapshot.runtime.activeEpisode || summoning} onClick={() => void summon()}>
              {summoning ? t("summon.testing", { defaultValue: "Starting…" }) : t("summon.testEntrance", { defaultValue: "Test Buddy entrance" })}
            </Button>
          </div>
        </header>
        <div className="page-scroll" ref={pageScroll}>
          <SettingsPage section={section} snapshot={snapshot} onPatch={onPatch} onAction={onAction} onNavigate={navigate} />
        </div>
      </section>
    </main>
  );
}

function NavButton({ item, active, onClick, t }: { item: (typeof NAV_ITEMS)[number]; active: boolean; onClick: () => void; t: ReturnType<typeof useTranslation>["t"] }) {
  return (
    <button type="button" className={`sidebar-link ${active ? "is-active" : ""}`} aria-current={active ? "page" : undefined} onClick={onClick}>
      <Icon name={item.icon} size={19} />
      <span>{t(item.key, { defaultValue: item.fallback })}</span>
      {item.id === "playground" && <span className="nav-new">{t("common.new", { defaultValue: "NEW" })}</span>}
    </button>
  );
}
