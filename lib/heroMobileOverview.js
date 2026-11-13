// ZENORIA_HERO_MOBILE_V2
import { parseHeroMobileSetting, isHeroMobileValueReadable, heroMobileLabel } from "./heroMobileSettings.js";
// ============================================================
// LIGNE DE L'ONGLET CONFIGURATION ET VALEURS DU JOURNAL POUR « VIDÉO D'ACCUEIL SUR MOBILE » — ZENORIA_HERO_MOBILE_V2
//
// Logique pure (aucun appel réseau, aucun React). Rien ne s'écrit ici : le réglage se modifie dans
// Contenu du site › Vitrine & ambiance (components/AdminHeroMobile.js).
//
// Même principe que « Badge Nouveauté » (lib/newBadgeOverview.js) : on n'invente jamais de valeur.
//  - ligne absente : le site applique l'image fixe + ▶ ; c'est un comportement défini, donc affiché « (par défaut) », jamais « Non défini » ;
//  - ligne présente mais illisible (la contrainte SQL de la base l'interdit) : « Valeur illisible », en alerte, avec ce que le site applique.
// ============================================================

// row : la ligne de site_settings ({ value, updated_at, ... }) ou null si rien n'est enregistré
export function heroMobileOverviewItems(row) {
  const hasRow = Boolean(row) && typeof row === "object";
  const applied = parseHeroMobileSetting(hasRow ? row.value : null);
  const label = "Vidéo d'accueil sur mobile";
  if (hasRow && !isHeroMobileValueReadable(row.value)) {
    return [
      {
        id: "hero_mobile_state",
        label,
        text: "Valeur illisible",
        tone: "warn",
        sub: "Le site applique : " + heroMobileLabel(applied.autoplay) + ".",
        missing: false,
      },
    ];
  }
  const text = heroMobileLabel(applied.autoplay) + (hasRow ? "" : " (par défaut)");
  let sub;
  if (applied.autoplay) {
    sub = "La vidéo se télécharge dès l'arrivée sur mobile (cached egress). Les visiteuses en économie de données gardent l'image fixe.";
  } else if (!hasRow) {
    sub = "Rien d'enregistré : réglage par défaut. La vidéo ne se charge que si la visiteuse appuie sur ▶.";
  } else {
    sub = "La vidéo ne se charge que si la visiteuse appuie sur ▶.";
  }
  const item = { id: "hero_mobile_state", label, text, sub, missing: false };
  if (applied.autoplay) item.tone = "warn";
  return [item];
}

// Valeur lisible d'un champ du journal (lib/configLog.js). Renvoie null pour tout autre champ : le journal garde alors son mode d'affichage habituel.
export function formatHeroMobileLogValue(field, v) {
  if (field !== "autoplay") return null;
  if (typeof v === "boolean") return heroMobileLabel(v);
  return null;
}
