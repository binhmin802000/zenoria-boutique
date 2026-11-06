import { parseGridOrderSetting, GRID_ORDER_MIN_DAYS, GRID_ORDER_MAX_DAYS } from "./gridOrder.js";

// ============================================================
// LIGNES DE L'ONGLET CONFIGURATION POUR « ORDRE DES BIJOUX » — ZENORIA_CONFIG_R4_V1
//
// Logique pure (aucun appel réseau, aucun React) : elle transforme la ligne « grid_order » de site_settings en trois lignes
// de lecture seule pour lib/configOverview.js (Accueil › Configuration). Rien ne s'écrit ici : le réglage se modifie dans
// Contenu du site › Vitrine & ambiance (components/AdminGridOrder.js).
//
// Même principe que le reste de la page : on n'invente jamais de valeur.
//  - ligne absente : le site applique son réglage par défaut (aléatoire, chaque jour) ; c'est un comportement défini,
//    donc affiché « (par défaut) » et jamais « Non défini » (comme l'effet saisonnier : « Automatique (par défaut) ») ;
//  - ligne présente mais illisible (la contrainte SQL de la base l'interdit) : « Valeur illisible », en alerte, et le site
//    applique alors le réglage par défaut.
// formatWhen : la fonction de date de configOverview.js (heure de Paris), transmise pour que le format reste le même partout.
// ============================================================

function plural(n) {
  return n + (n > 1 ? " jours" : " jour");
}

// La valeur enregistrée est-elle exactement ce que la base accepte ? (mode connu, jours entiers de 1 à 30, date lisible)
export function isGridOrderValueReadable(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (value.mode !== "random" && value.mode !== "manual") return false;
  const n = Number(value.everyDays);
  if (!Number.isInteger(n) || n < GRID_ORDER_MIN_DAYS || n > GRID_ORDER_MAX_DAYS) return false;
  if (value.shuffledAt !== undefined && value.shuffledAt !== "") {
    if (typeof value.shuffledAt !== "string" || !Number.isFinite(Date.parse(value.shuffledAt))) return false;
  }
  return true;
}

// row : la ligne de site_settings ({ value, updated_at, ... }) ou null si rien n'est enregistré
export function gridOrderOverviewItems(row, formatWhen) {
  const fmt = typeof formatWhen === "function" ? formatWhen : (v) => String(v);
  const hasRow = Boolean(row) && typeof row === "object";

  if (hasRow && !isGridOrderValueReadable(row.value)) {
    return [
      {
        id: "grid_mode",
        label: "Ordre d'affichage",
        text: "Valeur illisible",
        tone: "warn",
        sub: "Le site applique le réglage par défaut : aléatoire, chaque jour.",
        missing: false,
      },
    ];
  }

  const s = parseGridOrderSetting(hasRow ? row.value : null);
  const manual = s.mode === "manual";

  const mode = {
    id: "grid_mode",
    label: "Ordre d'affichage",
    text: hasRow ? (manual ? "Manuel" : "Aléatoire") : "Aléatoire (par défaut)",
    sub: !hasRow ? "Rien d'enregistré : réglage par défaut" : manual ? "Ordre de la base, comme avant" : "Le même ordre pour tous les visiteurs",
    missing: false,
  };

  let everyText = "";
  let everySub = "";
  if (manual) {
    everyText = "Sans effet en mode manuel";
    everySub = "Fréquence conservée : " + plural(s.everyDays);
  } else {
    everyText = (s.everyDays === 1 ? "Chaque jour" : "Tous les " + s.everyDays + " jours") + " à 3 h" + (hasRow ? "" : " (par défaut)");
    everySub = "Heure de Paris";
  }
  const every = { id: "grid_every", label: "Renouvellement", text: everyText, sub: everySub, missing: false };

  const when = s.shuffledAt ? String(fmt(s.shuffledAt) || "") : "";
  const shuffle = {
    id: "grid_shuffle",
    label: "Dernier mélange manuel",
    text: when || "Jamais",
    missing: false,
  };

  return [mode, every, shuffle];
}
