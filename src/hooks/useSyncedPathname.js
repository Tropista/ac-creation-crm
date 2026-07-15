import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { CRM_ROUTE_CHANGE_EVENT } from "../utils/uiCleanup";
import { isHashRouterMode } from "../utils/routes";

function getBrowserRoutePathname(fallback = "/") {
  if (typeof window === "undefined") return fallback;

  if (isHashRouterMode()) {
    const hashPath = window.location.hash.replace(/^#/, "").split(/[?#]/)[0];
    return hashPath?.startsWith("/") ? hashPath : fallback;
  }

  return window.location.pathname || fallback;
}

/**
 * Pathname aligné sur l'URL réelle du navigateur.
 * Quitter /factures peut mettre à jour l'historique sans synchroniser useLocation().
 */
export function useSyncedPathname() {
  const location = useLocation();
  const [browserPathname, setBrowserPathname] = useState(
    () => getBrowserRoutePathname(location.pathname)
  );

  useEffect(() => {
    setBrowserPathname(location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const syncFromBrowser = () => {
      setBrowserPathname(getBrowserRoutePathname(location.pathname));
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
    window.addEventListener("hashchange", syncFromBrowser);
    window.addEventListener(CRM_ROUTE_CHANGE_EVENT, syncFromBrowser);

    return () => {
      history.pushState = pushState;
      history.replaceState = replaceState;
      window.removeEventListener("popstate", syncFromBrowser);
      window.removeEventListener("hashchange", syncFromBrowser);
      window.removeEventListener(CRM_ROUTE_CHANGE_EVENT, syncFromBrowser);
    };
  }, [location.pathname]);

  return browserPathname;
}
