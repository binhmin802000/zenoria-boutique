// ZENORIA_FLAGGED_5E_V1 : comptes « à surveiller » = 3 annulations ou plus faites par la cliente sur 30 jours glissants.
// La règle est calculée côté base par la fonction SQL admin_flagged_accounts() (réservée aux administrateurs).
// Si la fonction n'est pas installée ou si l'appel échoue, aucun compte n'est signalé : l'écran continue de fonctionner.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export const FLAG_THRESHOLD = 3;
export const FLAG_WINDOW_DAYS = 30;

// Renvoie une Map : account_id -> { count, last }
export async function loadFlaggedAccounts() {
  try {
    const { data, error } = await supabase.rpc("admin_flagged_accounts");
    if (error || !Array.isArray(data)) return new Map();
    return new Map(data.map((r) => [r.account_id, { count: Number(r.cancellations) || 0, last: r.last_cancelled_at }]));
  } catch (e) {
    return new Map();
  }
}

// refreshKey : toute valeur qui change quand l'écran recharge ses données (le signalement est alors relu)
export function useFlaggedAccounts(refreshKey) {
  const [flagged, setFlagged] = useState(() => new Map());
  useEffect(() => {
    let alive = true;
    loadFlaggedAccounts().then((m) => {
      if (alive) setFlagged(m);
    });
    return () => {
      alive = false;
    };
  }, [refreshKey]);
  return flagged;
}
