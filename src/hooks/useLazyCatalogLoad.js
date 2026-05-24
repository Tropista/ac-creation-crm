import { useEffect, useRef } from "react";
import { isSupabaseConfigured } from "../supabase";
import { isCatalogDataEmpty, loadCatalogIntoData } from "../services/catalogLoad";

export function useLazyCatalogLoad(data, setData, { silent = true } = {}) {
  const dataRef = useRef(data);
  dataRef.current = data;
  const startedRef = useRef(false);

  useEffect(() => {
    if (!isSupabaseConfigured || startedRef.current) return undefined;
    if (!isCatalogDataEmpty(dataRef.current)) return undefined;

    startedRef.current = true;
    let cancelled = false;

    (async () => {
      try {
        await loadCatalogIntoData(dataRef.current, {
          setData: cancelled ? null : setData,
          showToastMessage: !silent,
        });
      } catch (error) {
        if (!cancelled) {
          console.warn("Chargement différé du catalogue impossible :", error);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [setData, silent]);
}
