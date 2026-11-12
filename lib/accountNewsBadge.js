// ZENORIA_ACCOUNT_NEWS_BADGE_V1
// Logique pure (aucun React, aucun acces reseau) : testee par tests/accountNewsBadge.test.mjs.
// Le branchement React est dans lib/useAccountNewsBadge.js.
//
// Objectif : afficher sur l'Accueil et le quiz EXACTEMENT le meme total que celui de Mon compte
// (meme memoire du « vu », cle zenoria_account_news_v1:<id du compte>, lib/accountNews.js), sans
// reprendre le calcul « vu/pas vu » a part. Un cache (duree reglee dans l'admin) limite seulement
// la frequence des appels reseau ; la memoire du « vu » (localStorage) est toujours relue a jour,
// donc une visite recente de Mon compte se reflete immediatement, meme avec un cache encore valide.
//
// Donnees necessaires : les lignes de customer_account_news() (avec payment_method et cancelled_by,
// ajoutes a la fonction pour ce lot, cf. sql/supabase_lot2_account_news_badge.sql) et celles de la
// nouvelle fonction customer_account_reviews(). Mises en cache ensemble (meme age).
import { orderNewsByOrder, countReviewNews } from "./accountNews.js";

export const BADGE_CACHE_PREFIX = "zenoria_account_news_fetch_v1:";

export function badgeCacheKey(userId) {
  return BADGE_CACHE_PREFIX + String(userId);
}

// Reconstruit, a partir des lignes de customer_account_news(), une commande minimale par identifiant
// (id, payment_method, cancelled_by) : suffisant pour orderNewsByOrder/isOrderNewsEvent, sans avoir
// a charger la liste complete des commandes (ce que fait Mon compte, mais que l'Accueil et le quiz
// n'ont pas besoin de faire par ailleurs).
export function ordersFromNewsRows(rows) {
  const map = new Map();
  (Array.isArray(rows) ? rows : []).forEach((r) => {
    if (!r || r.order_id === null || r.order_id === undefined) return;
    const k = String(r.order_id);
    if (map.has(k)) return;
    map.set(k, { id: r.order_id, payment_method: r.payment_method || null, cancelled_by: r.cancelled_by || null });
  });
  return Array.from(map.values());
}

// Lit un contenu de cache enregistre ; renvoie null s'il est absent ou invalide.
export function parseBadgeFetchCache(raw) {
  if (typeof raw !== "string" || !raw) return null;
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  if (typeof data.at !== "number" || !Number.isFinite(data.at)) return null;
  if (!Array.isArray(data.rows) || !Array.isArray(data.reviews)) return null;
  return { rows: data.rows, reviews: data.reviews, at: data.at };
}

// Le cache est-il encore valable, pour la duree (minutes) reglee dans l'admin ?
export function isBadgeFetchFresh(entry, minutes, nowMs) {
  if (!entry) return false;
  const maxAgeMs = Math.max(1, Number(minutes) || 0) * 60000;
  const age = nowMs - entry.at;
  return age >= 0 && age < maxAgeMs;
}

// Total affiche (commandes + avis), a partir des memes regles que Mon compte (lib/accountNews.js).
// store : resultat de parseStore(localStorage...), ou null si la memoire n'existe pas encore pour ce
// compte (ex. cliente n'ayant jamais ouvert Mon compte) : dans ce cas, 0 (prudent, coherent avec la
// premiere visite de Mon compte, qui ne declare elle-meme aucune nouveaute d'emblee).
export function countBadgeTotal(rows, reviews, store) {
  if (!store) return 0;
  const safeRows = Array.isArray(rows) ? rows : [];
  const safeReviews = Array.isArray(reviews) ? reviews : [];
  const orders = ordersFromNewsRows(safeRows);
  const byOrder = orderNewsByOrder(safeRows, orders, store);
  const commandes = Object.keys(byOrder).reduce((n, k) => n + byOrder[k], 0);
  const avis = countReviewNews(safeReviews, store);
  return commandes + avis;
}
