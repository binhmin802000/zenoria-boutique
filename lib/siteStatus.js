import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { normalizeStatus } from "@/lib/maintenance";

// ============================================================
// useSiteStatus - état de la maintenance vu par la page du site
//
// Sert au mode « boutique en pause » (bannière + commande fermée) et, pour un
// administrateur qui prévisualise le site pendant une maintenance totale, au
// bandeau rouge d'avertissement.
//
// Si la fonction SQL n'est pas installée ou si Supabase ne répond pas, le site reste
// ouvert : par défaut, rien ne s'affiche et rien n'est bloqué.
// L'état est relu toutes les 60 s et à chaque retour sur l'onglet.
// ============================================================

const INITIAL = { mode: "off", message: "", returnAt: null, previewOk: false, loaded: false };

export function useSiteStatus(intervalMs) {
  const [status, setStatus] = useState(INITIAL);

  const refresh = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc("get_site_status", { preview: null });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      setStatus({ ...normalizeStatus(row), loaded: true });
    } catch (e) {
      // erreur de lecture : on garde l'état précédent (par défaut : ouvert)
      setStatus((s) => ({ ...s, loaded: true }));
    }
  }, []);

  useEffect(() => {
    refresh();
    const everyMs = intervalMs || 60000;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, everyMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, intervalMs]);

  return status;
}
