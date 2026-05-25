import { useEffect, useRef } from "react";
import { getSupabase, isSupabaseConfigured } from "../supabase";
import { showToast } from "../utils/toast";

/**
 * Abonnement Realtime Supabase (devis + factures) pour rafraîchir l'atelier.
 * Fallback : resync manuelle / polling page inchangés si Supabase absent.
 */
export function useAtelierRealtime({ enabled = false, onRefresh }) {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!enabled || !isSupabaseConfigured || typeof onRefreshRef.current !== "function") {
      return undefined;
    }

    let channel;
    let cancelled = false;

    async function subscribe() {
      try {
        const supabase = await getSupabase();
        if (cancelled) return;

        const scheduleRefresh = () => {
          clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(async () => {
            try {
              await onRefreshRef.current?.({ silent: true });
              showToast("Atelier synchronisé (temps réel)", "info");
            } catch (error) {
              console.warn("[Realtime atelier]", error);
            }
          }, 800);
        };

        channel = supabase
          .channel("crm-atelier-sync")
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "quotes" },
            scheduleRefresh
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "invoices" },
            scheduleRefresh
          )
          .subscribe();
      } catch (error) {
        console.warn("[Realtime atelier] indisponible :", error);
      }
    }

    subscribe();

    return () => {
      cancelled = true;
      clearTimeout(debounceRef.current);
      if (channel) {
        getSupabase()
          .then((supabase) => supabase.removeChannel(channel))
          .catch(() => {});
      }
    };
  }, [enabled]);
}
