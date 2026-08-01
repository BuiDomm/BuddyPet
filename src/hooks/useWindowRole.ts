import { useEffect, useState } from "react";
import { desktopBridge } from "../features/bridge/desktopBridge";
import type { WindowRole } from "../features/domain/types";

export function useWindowRole() {
  const [role, setRole] = useState<WindowRole | null>(null);

  useEffect(() => {
    let mounted = true;
    void desktopBridge.getWindowRole().then((nextRole) => {
      if (mounted) {
        document.documentElement.dataset.windowRole = nextRole;
        setRole(nextRole);
      }
    });
    return () => {
      mounted = false;
      delete document.documentElement.dataset.windowRole;
    };
  }, []);

  return role;
}
