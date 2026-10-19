// ============================================================
// RÉGLAGE « AVIS CLIENTES » (interrupteur ON/OFF) — ZENORIA_STORY_REVIEWS_V1
//
// Fichier SANS dépendance, sur le modèle de lib/shippingSettings.js.
// Utilisé par l'administration (components/AdminLegalPages.js), la page d'accueil (lien du footer)
// et la page /charte-des-avis.
//
// Enregistrement : table « site_settings », clé « reviews », valeur JSON : { "enabled": false }
//   enabled : true  -> avis visibles ET charte /charte-des-avis visible
//             false -> avis masqués ET charte masquée (404), lien du footer retiré
// Les avis déjà déposés ne sont jamais supprimés par cet interrupteur.
//
// Réglage absent ou illisible : DEFAULT_REVIEWS = DÉSACTIVÉ.
// Choix volontaire : on n'affiche jamais des avis sans leur charte par accident.
// La Politique de confidentialité n'a PAS d'interrupteur : elle reste toujours en ligne (RGPD).
// ============================================================

export const REVIEWS_KEY = "reviews";
export const DEFAULT_REVIEWS = Object.freeze({ enabled: false });

// Valeurs de la charte : une seule source de vérité
export const REVIEWS_RULES = Object.freeze({
  windowDays: 30, // délai pour déposer un avis après la livraison
  maxCommentLength: 1000, // caractères maximum du commentaire
  moderationDays: 5, // jours ouvrés maximum de modération
  publicationYears: 3, // durée de publication d'un avis
  minReviewsForAverage: 3, // note moyenne affichée à partir de ce nombre d'avis
});

export function parseReviewsSetting(value) {
  const v = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return { enabled: typeof v.enabled === "boolean" ? v.enabled : DEFAULT_REVIEWS.enabled };
}

export function buildReviewsValue(s) {
  return parseReviewsSetting(s);
}

export function sameReviewsSetting(a, b) {
  return parseReviewsSetting(a).enabled === parseReviewsSetting(b).enabled;
}

export function describeReviews(setting) {
  return parseReviewsSetting(setting).enabled
    ? "avis clientes et charte des avis visibles"
    : "avis clientes et charte des avis masqués";
}

// Lecture côté site ou serveur. Ne lève jamais d'erreur : en cas de problème, réglage par défaut (désactivé).
export async function fetchReviewsSetting(client, table = "site_settings") {
  try {
    const res = await client.from(table).select("value").eq("key", REVIEWS_KEY).maybeSingle();
    if (res && !res.error && res.data) return parseReviewsSetting(res.data.value);
  } catch (e) {
    // réglage illisible : valeur par défaut
  }
  return DEFAULT_REVIEWS;
}
