// ============================================================
// RÉGLAGES SIMPLES DU SITE
//
// Ils sont enregistrés dans la table « site_settings » (une clé, une valeur JSON) et se modifient dans
// l'administration. Pour l'instant, un seul réglage : l'animation saisonnière de la page d'accueil
// (clé « season_fx »). Voir supabase_site_settings.sql.
//
// Valeurs possibles de « season_fx » :
//   { "mode": "auto" }                              suit la date (comportement d'origine)
//   { "mode": "forced", "season": "automne" }       la même saison toute l'année
//   { "mode": "off" }                               aucune animation
// ============================================================

export const SITE_SETTINGS_TABLE = "site_settings";
export const SEASON_FX_KEY = "season_fx";

export const FX_MODES = ["auto", "forced", "off"];
// Identifiants techniques des 4 saisons (colonne « key » de la table « families »)
export const FX_SEASON_KEYS = ["printemps", "ete", "automne", "hiver"];
export const FX_SEASON_NAMES = { printemps: "Printemps", ete: "Été", automne: "Automne", hiver: "Hiver" };

// Lit la valeur enregistrée. Tout ce qui n'est pas reconnu (table absente, valeur abîmée, saison inconnue)
// redonne « automatique » : le site ne se retrouve jamais sans animation par accident, ni avec une saison inventée.
export function parseSeasonFxSetting(value) {
  const v = value && typeof value === "object" && !Array.isArray(value) ? value : null;
  if (!v) return { mode: "auto", season: null };
  if (v.mode === "off") return { mode: "off", season: null };
  if (v.mode === "forced" && FX_SEASON_KEYS.includes(v.season)) return { mode: "forced", season: v.season };
  return { mode: "auto", season: null };
}

// Fabrique la valeur à enregistrer depuis le formulaire. Renvoie null si le choix est incomplet.
export function buildSeasonFxValue(mode, season) {
  if (mode === "auto") return { mode: "auto" };
  if (mode === "off") return { mode: "off" };
  if (mode === "forced" && FX_SEASON_KEYS.includes(season)) return { mode: "forced", season };
  return null;
}

// Saison réellement animée :
//  - désactivée : aucune
//  - forcée     : la saison choisie dans l'administration (un clic de la visiteuse ne la change pas)
//  - automatique: la saison calculée par le site (clic de la visiteuse, sinon date du jour)
export function pickFxSeason(setting, autoSeason) {
  if (!setting || setting.mode === "auto") return autoSeason || null;
  if (setting.mode === "off") return null;
  if (setting.mode === "forced") return setting.season || null;
  return autoSeason || null;
}

// Petit texte au-dessus des saisons quand l'animation est forcée
export function fxForcedPill(seasonName) {
  return { prefix: "Ambiance :", name: seasonName };
}

// Deux réglages sont-ils identiques ? (pour activer ou non le bouton Enregistrer)
export function sameSeasonFx(a, b) {
  const x = parseSeasonFxSetting(a);
  const y = parseSeasonFxSetting(b);
  return x.mode === y.mode && (x.season || null) === (y.season || null);
}
