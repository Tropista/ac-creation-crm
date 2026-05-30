import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { CRM_ROUTE_CHANGE_EVENT } from "../utils/uiCleanup";

/**
 * Pathname aligné sur l'URL réelle du navigateur.
 * Quitter /factures peut mettre à jour l'historique sans synchroniser useLocation().
 */
export function useSyncedPathname() {
  const location = useLocation();
  const [browserPathname, setBrowserPathname] = useState(
    () =>
      (typeof window !== "undefined" ? window.location.pathname : location.pathname) ||
      "/"
  );

  useEffect(() => {
    setBrowserPathname(location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const syncFromBrowser = () => {
      setBrowserPathname(window.location.pathname || "/");
    };

    const pushState = history.pushState.bind(history);
    const replaceState = history.replaceState.bind(history);

    history.pushState = (...args) => {
      pushState(...args);
      syncFromBrowser();
    };
    history.replaceState = (...args) => {
      replaceState(...args);
      syncFromBrowser();
    };

    window.addEventListener("popstate", syncFromBrowser);
    window.addEventListener(CRM_ROUTE_CHANGE_EVENT, syncFromBrowser);

    return () => {
      history.pushState = pushState;
      history.replaceState = replaceState;
      window.removeEventListener("popstate", syncFromBrowser);
      window.removeEventListener(CRM_ROUTE_CHANGE_EVENT, syncFromBrowser);
    };
  }, []);

  return browserPathname;
}
