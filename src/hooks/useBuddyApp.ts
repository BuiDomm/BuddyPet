import { useCallback, useEffect, useRef, useState } from "react";
import { desktopBridge } from "../features/bridge/desktopBridge";
import { DEFAULT_SNAPSHOT } from "../features/domain/defaults";
import type { ActionRequest, AppSnapshot, SettingsV1 } from "../features/domain/types";

export function useBuddyApp() {
  const [snapshot, setSnapshot] = useState<AppSnapshot>(DEFAULT_SNAPSHOT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const mounted = useRef(true);
  const snapshotRef = useRef(DEFAULT_SNAPSHOT);
  const settingsQueue = useRef<Promise<void>>(Promise.resolve());
  const settingsRevision = useRef(0);
  const pendingSettingsWrites = useRef(0);

  const applySnapshot = useCallback((next: AppSnapshot) => {
    snapshotRef.current = next;
    setSnapshot(next);
  }, []);

  useEffect(() => {
    mounted.current = true;
    let unsubscribe: (() => void) | undefined;
    void desktopBridge.getSnapshot().then((next) => {
      if (!mounted.current) return;
      applySnapshot(next);
      setLoading(false);
    });
    void desktopBridge.subscribeSnapshot((next) => {
      if (mounted.current && pendingSettingsWrites.current === 0) applySnapshot(next);
    }).then((unlisten) => {
      unsubscribe = unlisten;
    });
    return () => {
      mounted.current = false;
      unsubscribe?.();
    };
  }, [applySnapshot]);

  const persist = useCallback(async (settings: SettingsV1, complete = false) => {
    const previous = snapshotRef.current;
    const revision = ++settingsRevision.current;
    pendingSettingsWrites.current += 1;
    applySnapshot({ ...previous, settings });
    setSaving(true);
    setSaveError(null);
    const operation = settingsQueue.current.then(() => complete
      ? desktopBridge.completeOnboarding(settings)
      : desktopBridge.updateSettings(settings));
    settingsQueue.current = operation.then(() => undefined, () => undefined);
    try {
      const next = await operation;
      if (mounted.current && revision === settingsRevision.current) applySnapshot(next);
    } catch (error) {
      if (mounted.current && revision === settingsRevision.current) {
        applySnapshot(previous);
        setSaveError(error instanceof Error ? error.message : "settingsUpdateFailed");
      }
    } finally {
      pendingSettingsWrites.current -= 1;
      if (mounted.current && revision === settingsRevision.current) setSaving(false);
    }
  }, [applySnapshot]);

  const patchSettings = useCallback(
    (patch: Partial<SettingsV1>) => {
      const settings = { ...snapshotRef.current.settings, ...patch };
      void persist(settings);
    },
    [persist],
  );

  const performAction = useCallback(async (request: ActionRequest) => {
    const next = await desktopBridge.performAction(request);
    if (mounted.current) applySnapshot(next);
  }, [applySnapshot]);

  return {
    snapshot,
    loading,
    saving,
    saveError,
    patchSettings,
    persist,
    performAction,
  };
}
