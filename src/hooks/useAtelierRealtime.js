import { useEffect, useRef } from "react";
import { getSupabase, isSupabaseConfigured } from "../supabase";
import { loadData } from "../services/dataService";
import { showToast } from "../utils/toast";
import { findNewPublicAcceptances } from "../utils/publicQuoteAcceptance";

/**
 * Abonnement Realtime Supabase (devis + factures) pour rafraîchir l'atelier / tableau de bord.
 * Fallback : resync manuelle / polling page inchangés si Supabase absent.
 */
export function useAtelierRealtime({
  enabled = false,
  onRefresh,
  alertPublicAcceptances = false,
  syncToastMessage = "Atelier synchronisé (temps réel)",
} = {}) {
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
              const beforeQuotes = alertPublicAcceptances
                ? loadData().quotes || []
                : [];

              await onRefreshRef.current?.({ silent: true });

              if (alertPublicAcceptances) {
                const afterQuotes = loadData().quotes || [];
                const newAcceptances = findNewPublicAcceptances(beforeQuotes, afterQuotes);
                for (const quote of newAcceptances) {
                  showToast(
                    `Devis ${quote.number} accepté en ligne par le client`,
                    "success"
                  );
                }
              }

              if (syncToastMessage) {
                showToast(syncToastMessage, "info");
              }
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
  }, [alertPublicAcceptances, enabled, syncToastMessage]);
}
