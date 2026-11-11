import { parseNewBadgeSetting, DEFAULT_NEW_BADGE, NEW_BADGE_MIN_DAYS, NEW_BADGE_MAX_DAYS } from "./newBadge.js"; // ZENORIA_NEW_BADGE_V3
// ============================================================
// LIGNES DE L'ONGLET CONFIGURATION POUR « BADGE NOUVEAUTÉ » — ZENORIA_NEW_BADGE_V3
//
// Logique pure (aucun appel réseau, aucun React) : elle transforme la ligne « new_badge » de site_settings en deux lignes
// de lecture seule pour lib/configOverview.js (Accueil › Configuration). Rien ne s'écrit ici : le réglage se modifie dans
// Contenu du site › Vitrine & ambiance (components/AdminNewBadge.js).
//
// Même principe que « Ordre des bijoux » (lib/gridOrderOverview.js) : on n'invente jamais de valeur.
//  - ligne absente : le site applique son réglage par défaut (affiché, 14 jours) ; c'est un comportement défini,
//    donc affiché « (par défaut) » et jamais « Non défini » ;
//  - ligne présente mais illisible (la contrainte SQL de la base l'interdit) : « Valeur illisible », en alerte, avec ce que
//    le site applique réellement (parseNewBadgeSetting corrige ou remplace la valeur).
// ============================================================
function plural(n) {
  return n + (n > 1 ? " jours" : " jour");
}
// La valeur enregistrée est-elle exactement ce que la base accepte ? (booléen « enabled », jours entiers de 1 à 90)
export function isNewBadgeValueReadable(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (typeof value.enabled !== "boolean") return false;
  if (typeof value.days !== "number" || !Number.isInteger(value.days)) return false;
  return value.days >= NEW_BADGE_MIN_DAYS && value.days <= NEW_BADGE_MAX_DAYS;
}
// row : la ligne de site_settings ({ value, updated_at, ... }) ou null si rien n'est enregistré
export function newBadgeOverviewItems(row) {
  const hasRow = Boolean(row) && typeof row === "object";
  const applied = parseNewBadgeSetting(hasRow ? row.value : null);
  if (hasRow && !isNewBadgeValueReadable(row.value)) {
    return [
      {
        id: "new_badge_state",
        label: "Badge Nouveauté",
        text: "Valeur illisible",
        tone: "warn",
        sub: "Le site applique : " + (applied.enabled ? "affiché, " + plural(applied.days) : "masqué") + ".",
        missing: false,
      },
    ];
  }
  const state = {
    id: "new_badge_state",
    label: "Badge Nouveauté",
    text: hasRow ? (applied.enabled ? "Affiché" : "Masqué") : "Affiché (par défaut)",
    sub: !hasRow ? "Rien d'enregistré : réglage par défaut" : applied.enabled ? "Sur la grille des bijoux de l'accueil" : "Aucun bijou n'affiche le badge",
    missing: false,
  };
  let daysText = "";
  let daysSub = "";
  if (!applied.enabled) {
    daysText = "Sans effet (badge masqué)";
    daysSub = "Durée conservée : " + plural(applied.days);
  } else {
    daysText = plural(applied.days) + (hasRow ? "" : " (par défaut)");
    daysSub = "Après l'ajout du bijou au catalogue";
  }
  const days = { id: "new_badge_days", label: "Durée d'affichage", text: daysText, sub: daysSub, missing: false };
  return [state, days];
}
