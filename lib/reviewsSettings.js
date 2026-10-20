// ============================================================
// RÉGLAGE « AVIS CLIENTES » (interrupteur ON/OFF + mode d'affichage) — ZENORIA_REVIEWS_STEP1_V1
//
// Fichier SANS dépendance, sur le modèle de lib/shippingSettings.js.
// Utilisé par l'administration (components/AdminLegalPages.js), la page d'accueil (lien du footer,
// panneau « Mes commandes & avis ») et la page /charte-des-avis.
//
// Enregistrement : table « site_settings », clé « reviews », valeur JSON :
//     { "enabled": false, "mode": "full" }
//   enabled : true  -> avis visibles ET charte /charte-des-avis visible
//             false -> avis masqués ET charte masquée (404), lien du footer retiré
//             (le dépôt reste possible pour les administratrices, pour les tests)
//   mode    : "full"  -> étoiles + commentaires (+ réponse de la boutique)
//             "stars" -> étoiles seulement : pas de champ commentaire, textes et réponses non affichés
//             (les textes déjà reçus restent en base)
// Contrainte SQL : site_settings_reviews_valid (supabase_reviews.sql).
//
// Réglage absent ou illisible : DEFAULT_REVIEWS = DÉSACTIVÉ, mode complet.
// La Politique de confidentialité n'a PAS d'interrupteur : elle reste toujours en ligne (RGPD).
// ============================================================

export const REVIEWS_KEY = "reviews";
export const REVIEW_MODES = ["full", "stars"];
export const DEFAULT_REVIEWS = Object.freeze({ enabled: false, mode: "full" });

// Valeurs de la charte : une seule source de vérité côté site
// (les mêmes valeurs sont écrites dans supabase_reviews.sql : à modifier aux DEUX endroits)
export const REVIEWS_RULES = Object.freeze({
  windowDays: 30, // délai pour déposer un avis après la livraison
  maxCommentLength: 1000, // caractères maximum du commentaire (et de la réponse de la boutique)
  moderationDays: 5, // jours ouvrés maximum de modération
  publicationYears: 3, // durée de publication d'un avis
  minReviewsForAverage: 3, // note moyenne affichée à partir de ce nombre d'avis
});

// Motifs de refus prévus par la charte (codes identiques à la contrainte SQL)
export const REFUSAL_REASONS = Object.freeze({
  abusive: "Propos injurieux ou discriminatoires",
  personal_data: "Données personnelles",
  advertising: "Publicité ou lien commercial",
  off_topic: "Sans rapport avec le produit",
});

export function parseReviewsSetting(value) {
  const v = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    enabled: typeof v.enabled === "boolean" ? v.enabled : DEFAULT_REVIEWS.enabled,
    mode: REVIEW_MODES.includes(v.mode) ? v.mode : DEFAULT_REVIEWS.mode,
  };
}

export function buildReviewsValue(s) {
  return parseReviewsSetting(s);
}

export function sameReviewsSetting(a, b) {
  const x = parseReviewsSetting(a);
  const y = parseReviewsSetting(b);
  return x.enabled === y.enabled && x.mode === y.mode;
}

export function describeReviews(setting) {
  const s = parseReviewsSetting(setting);
  const mode = s.mode === "stars" ? "étoiles seulement" : "étoiles + commentaires";
  return s.enabled ? `avis clientes et charte des avis visibles (${mode})` : `avis clientes et charte des avis masqués (${mode})`;
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

// Messages lisibles pour les erreurs renvoyées par les fonctions SQL du module
export function reviewErrorMessage(err) {
  const msg = (err && err.message) || String(err || "");
  const map = [
    ["NOT_AUTHENTICATED", "Connectez-vous pour donner votre avis."],
    ["REVIEWS_DISABLED", "Le dépôt d'avis n'est pas encore ouvert."],
    ["INVALID_RATING", "Choisissez une note de 1 à 5 étoiles."],
    ["ORDER_NOT_DELIVERED", "Cette commande n'est pas encore livrée."],
    ["REVIEW_WINDOW_CLOSED", "Le délai de 30 jours après la livraison est dépassé."],
    ["PRODUCT_NOT_IN_ORDER", "Ce bijou ne fait pas partie de cette commande."],
    ["COMMENT_TOO_LONG", "Votre commentaire dépasse 1 000 caractères."],
    ["REVIEW_ALREADY_EXISTS", "Vous avez déjà un avis en cours pour ce bijou."],
    ["REVIEW_NOT_FOUND", "Cet avis est introuvable ou ne peut plus être retiré."],
    ["NOT_ADMIN", "Action réservée à l'administration."],
    ["INVALID_REASON", "Choisissez un motif de refus."],
    ["INVALID_TRANSITION", "Cette action n'est pas possible pour cet avis."],
    ["REPLY_TOO_LONG", "La réponse dépasse 1 000 caractères."],
    ["REVIEW_CONTENT_LOCKED", "Le contenu d'un avis ne peut pas être modifié."],
  ];
  const hit = map.find(([code]) => msg.includes(code));
  if (hit) return hit[1];
  if (/could not find the function|does not exist|schema cache/i.test(msg)) {
    return "Le module avis n'est pas installé dans la base : exécutez supabase_reviews.sql dans Supabase.";
  }
  return "Une erreur est survenue. Réessayez dans un instant.";
}
