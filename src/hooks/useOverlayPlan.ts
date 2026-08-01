import { useEffect, useState } from "react";
import { desktopBridge } from "../features/bridge/desktopBridge";
import type { EpisodePlan } from "../features/domain/types";

export function useOverlayPlan() {
  const [plan, setPlan] = useState<EpisodePlan | null>(null);

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | undefined;

    void desktopBridge.getOverlayPayload().then((payload) => {
      if (mounted) setPlan(payload);
    });
    void desktopBridge.subscribeOverlay((payload) => {
      if (mounted) setPlan(payload);
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
