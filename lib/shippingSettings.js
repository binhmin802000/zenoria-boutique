// ============================================================
// RÉGLAGE DE LA LIVRAISON OFFERTE (montant et interrupteur)
//
// Fichier SANS dépendance : il est utilisé par la page d'accueil (pages/index.js), la page du quiz (pages/quiz.js,
// components/QuizChrome.js) et l'administration (components/AdminShipping.js, onglet « Contenu du site »).
//
// Enregistrement : table « site_settings », clé « shipping », valeur JSON :
//     { "enabled": true, "threshold": 75 }
//   enabled   : interrupteur « Livraison offerte » (true : activée, false : désactivée)
//   threshold : montant en euros, entier de 1 à 1 000, comparé au montant du panier AVANT code promo (>=)  // ZENORIA_SHIPPING_RULE_V1
// Voir supabase_shipping.sql.
//
// Livraison désactivée :
//   - le segment « Livraison offerte dès X € » disparaît du bandeau (accueil et quiz) ;
//   - la barre « Plus que X € pour la livraison offerte » et la phrase du panier disparaissent ;
//   - la livraison est facturée quel que soit le montant du panier ;
//   - les codes promo ne changent pas le droit à la livraison offerte : ils se déduisent du montant du panier.
//
// Si le réglage est absent ou illisible (script SQL pas encore exécuté, réseau coupé, valeur abîmée), le site
// utilise DEFAULT_SHIPPING : activée, 75 €.
// ============================================================

export const SHIPPING_KEY = "shipping";
export const SHIPPING_MIN = 1;
export const SHIPPING_MAX = 1000;
export const DEFAULT_SHIPPING = Object.freeze({ enabled: true, threshold: 75 });

// Le bandeau du haut de page, sans son premier segment
const STRIP_BASE = "Créations façonnées à la main en cristaux Swarovski · Paiement sécurisé";

export function isValidThreshold(n) {
  return typeof n === "number" && Number.isInteger(n) && n >= SHIPPING_MIN && n <= SHIPPING_MAX;
}

// Lit la valeur enregistrée. Tout ce qui n'est pas reconnu redonne la valeur par défaut, champ par champ :
// le site n'affiche jamais un montant inventé ni une livraison désactivée par accident.
export function parseShippingSetting(value) {
  const v = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    enabled: typeof v.enabled === "boolean" ? v.enabled : DEFAULT_SHIPPING.enabled,
    threshold: isValidThreshold(v.threshold) ? v.threshold : DEFAULT_SHIPPING.threshold,
  };
}

// Valeur à enregistrer depuis le formulaire (toujours complète et valide)
export function buildShippingValue(s) {
  return parseShippingSetting(s);
}

export function sameShippingSetting(a, b) {
  const x = parseShippingSetting(a);
  const y = parseShippingSetting(b);
  return x.enabled === y.enabled && x.threshold === y.threshold;
}

// Saisie du montant dans l'administration : entier d'euros uniquement (un « € » final est toléré)
export function parseThresholdInput(text) {
  const t = String(text === null || text === undefined ? "" : text).trim().replace(/\s+/g, "").replace(/€$/, "");
  if (!/^\d+$/.test(t)) return { ok: false, value: null, error: "Saisissez un nombre entier d'euros, sans virgule ni décimales." };
  const n = Number(t);
  if (n < SHIPPING_MIN || n > SHIPPING_MAX) return { ok: false, value: null, error: `Le montant doit être compris entre ${SHIPPING_MIN} et 1 000 €.` };
  return { ok: true, value: n, error: "" };
}

// Règle unique : la livraison est offerte quand elle est activée et que le montant du panier, AVANT code promo, atteint le seuil.
// (Le calcul complet est dans lib/cartTotals.js ; un code promo ne change jamais ce droit.)
export function qualifiesForFreeShipping(setting, cartAmount) {
  const s = parseShippingSetting(setting);
  return s.enabled && Number(cartAmount) >= s.threshold;
}

// Bandeau du haut de page : « Livraison offerte dès 75 € · Créations façonnées… » ou, livraison désactivée, sans le premier segment
export function shippingStripText(setting) {
  const s = parseShippingSetting(setting);
  return s.enabled ? `Livraison offerte dès ${s.threshold} € · ${STRIP_BASE}` : STRIP_BASE;
}

// Texte du réglage enregistré, pour l'administration
export function describeShipping(setting) {
  const s = parseShippingSetting(setting);
  return s.enabled ? `livraison offerte dès ${s.threshold} €` : `livraison offerte désactivée (montant conservé : ${s.threshold} €)`;
}

// Lecture côté site. Ne lève jamais d'erreur : en cas de problème, on renvoie le réglage par défaut.
export async function fetchShippingSetting(client, table = "site_settings") {
  try {
    const res = await client.from(table).select("value").eq("key", SHIPPING_KEY).maybeSingle();
    if (res && !res.error && res.data) return parseShippingSetting(res.data.value);
  } catch (e) {
    // réglage illisible : valeur par défaut
  }
  return DEFAULT_SHIPPING;
}
