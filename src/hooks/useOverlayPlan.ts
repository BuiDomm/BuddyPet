import { useEffect, useState } from "react";
import { desktopBridge } from "../features/bridge/desktopBridge";
import type { EpisodePlan } from "../features/domain/types";
import { i18n } from "../i18n";

export function useOverlayPlan() {
  const [plan, setPlan] = useState<EpisodePlan | null>(null);

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | undefined;

    const applyPlan = (payload: EpisodePlan | null) => {
      if (!mounted) return;
      if (payload && i18n.resolvedLanguage !== payload.locale) {
        void i18n.changeLanguage(payload.locale);
      }
      setPlan(payload);
    };

    void desktopBridge.getOverlayPayload().then((payload) => {
      applyPlan(payload);
    });
    void desktopBridge.subscribeOverlay((payload) => {
      applyPlan(payload);
    }).then((unlisten) => {
      unsubscribe = unlisten;
    });

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);

  return plan;
}
