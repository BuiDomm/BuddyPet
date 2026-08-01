import { BuddyCharacter } from "./components/BuddyCharacter";
import { useTranslation } from "react-i18next";
import { BubbleOverlay } from "./features/overlay/BubbleOverlay";
import { EffectOverlay } from "./features/overlay/EffectOverlay";
import { PetStage } from "./features/overlay/PetStage";
import { Onboarding } from "./features/onboarding/Onboarding";
import { SettingsApp } from "./features/settings/SettingsApp";
import { useBuddyApp } from "./hooks/useBuddyApp";
import { useOverlayPlan } from "./hooks/useOverlayPlan";
import { useWindowRole } from "./hooks/useWindowRole";
import { DEFAULT_BUDDY_ID } from "./features/domain/types";

function OverlayRouter({ role }: { role: "pet-stage" | "bubble" | "effect" }) {
  const plan = useOverlayPlan();
  if (!plan) return null;
  if (role === "pet-stage") return <PetStage key={plan.eventId} plan={plan} />;
  if (role === "bubble") return <BubbleOverlay key={plan.eventId} plan={plan} />;
  return <EffectOverlay key={plan.eventId} plan={plan} />;
}

function LoadingScreen() {
  const { t } = useTranslation();
  return (
    <main className="loading-screen" aria-label={t("onboarding.waking", { defaultValue: "Waking your buddy…" })}>
      <BuddyCharacter buddyId={DEFAULT_BUDDY_ID} size="medium" mood="enter" decorative />
      <div><span/><span/><span/></div>
      <p>{t("onboarding.waking", { defaultValue: "Waking your buddy…" })}</p>
    </main>
  );
}

export default function App() {
  const role = useWindowRole();
  const app = useBuddyApp();

  if (!role) return null;
  if (role !== "settings") return <OverlayRouter role={role} />;
  if (app.loading) return <LoadingScreen />;
  if (!app.snapshot.settings.onboardingCompleted) {
    return (
      <Onboarding
        initialSettings={app.snapshot.settings}
        capturePermission={app.snapshot.runtime.capturePermission}
        onAction={app.performAction}
        onComplete={async (settings) => {
          const saved = await app.persist(settings, true);
          if (saved) {
            await app.performAction({ action: "previewAction", petId: settings.selectedPets[0] ?? DEFAULT_BUDDY_ID });
          }
        }}
      />
    );
  }
  return <SettingsApp snapshot={app.snapshot} saving={app.saving} saveError={app.saveError} onPatch={app.patchSettings} onAction={app.performAction} />;
}
