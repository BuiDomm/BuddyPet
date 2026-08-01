import { BuddyCharacter } from "./components/BuddyCharacter";
import { BubbleOverlay } from "./features/overlay/BubbleOverlay";
import { EffectOverlay } from "./features/overlay/EffectOverlay";
import { PetStage } from "./features/overlay/PetStage";
import { Onboarding } from "./features/onboarding/Onboarding";
import { SettingsApp } from "./features/settings/SettingsApp";
import { useBuddyApp } from "./hooks/useBuddyApp";
import { useOverlayPlan } from "./hooks/useOverlayPlan";
import { useWindowRole } from "./hooks/useWindowRole";

function OverlayRouter({ role }: { role: "pet-stage" | "bubble" | "effect" }) {
  const plan = useOverlayPlan();
  if (!plan) return null;
  if (role === "pet-stage") return <PetStage key={plan.eventId} plan={plan} />;
  if (role === "bubble") return <BubbleOverlay key={plan.eventId} plan={plan} />;
  return <EffectOverlay key={plan.eventId} plan={plan} />;
}

function LoadingScreen() {
  return (
    <main className="loading-screen" aria-label="BuddyPet is waking up">
      <BuddyCharacter buddyId="goat10" size="medium" mood="enter" decorative />
      <div><span/><span/><span/></div>
      <p>Waking BuddyPet…</p>
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
        onComplete={(settings) => app.persist(settings, true)}
      />
    );
  }
  return <SettingsApp snapshot={app.snapshot} saving={app.saving} saveError={app.saveError} onPatch={app.patchSettings} onAction={app.performAction} />;
}
