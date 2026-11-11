// ============================================================
// NOUVEAUTES DE « MON COMPTE » — ZENORIA_ACCOUNT_NEWS_V1 / ZENORIA_ACCOUNT_NEWS_V2
//
// Logique pure (aucun React, aucun acces reseau) : testee par tests/accountNews.test.mjs.
// Le branchement React est dans lib/useAccountNews.js.
//
// Principe : on compte les changements que la cliente n'a pas encore vus.
//  - Commandes : un evenement = une ligne de order_status_history renvoyee par la fonction SQL
//    customer_account_news() (statuts paid, shipped, delivered, cancelled).
//      * shipped, delivered : comptes (y compris « En main propre »)
//      * paid : compte seulement pour un virement confirme (payment_method = "transfer"),
//        jamais pour un paiement par carte (la cliente vient de le faire elle-meme)
//      * cancelled : compte seulement si l'annulation est automatique (cancelled_by = "system")
//      * une action faite par la cliente elle-meme (par_moi = true) n'est jamais comptee
//  - Avis : un avis compte (une fois) quand il est publie ou refuse, ou quand une reponse de
//    Zenoria apparait. Un refus n'a pas de date propre : on compare une « signature » de l'avis.
//
// Memoire du « vu » : navigateur, par compte (cle zenoria_account_news_v1:<id du compte>).
//  - orders  : date serveur (ms) de depart du compte (premiere visite) : plancher commun a toutes les commandes
//  - seen    : { idCommande: date serveur (ms) du dernier evenement vu } -- V2 : une commande est « vue »
//              quand la cliente ouvre son detail (valeur absente des anciennes memoires : lue comme {})
//  - reviews : { idAvis: signature } vue pour chaque avis
//  Premiere visite d'un compte : le point de depart est pris sur l'etat courant (aucune nouveaute
//  d'emblee). Une partie du point de depart reste a null tant que sa lecture a echoue, pour ne
//  jamais declarer « nouveau » tout l'historique apres une erreur reseau.
// ============================================================
export const NEWS_STORAGE_PREFIX = "zenoria_account_news_v1:";
export const NEWS_STORE_VERSION = 1; // inchange : le champ « seen » (V2) est optionnel, les memoires existantes restent valables

export function storageKey(userId) {
  return NEWS_STORAGE_PREFIX + String(userId);
}

export function emptyStore() {
  return { v: NEWS_STORE_VERSION, orders: null, seen: {}, reviews: null };
}

// Lit un contenu enregistre ; renvoie null s'il est absent ou invalide.
export function parseStore(raw) {
  if (typeof raw !== "string" || !raw) return null;
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return null;
  }
  if (!data || typeof data !== "object" || data.v !== NEWS_STORE_VERSION) return null;
  const orders = typeof data.orders === "number" && Number.isFinite(data.orders) ? data.orders : null;
  const seen = {};
  if (data.seen && typeof data.seen === "object" && !Array.isArray(data.seen)) {
    Object.keys(data.seen).forEach((k) => {
      if (typeof data.seen[k] === "number" && Number.isFinite(data.seen[k])) seen[k] = data.seen[k];
    });
  }
  let reviews = null;
  if (data.reviews && typeof data.reviews === "object" && !Array.isArray(data.reviews)) {
    reviews = {};
    Object.keys(data.reviews).forEach((k) => {
      if (typeof data.reviews[k] === "string") reviews[k] = data.reviews[k];
    });
  }
  return { v: NEWS_STORE_VERSION, orders, seen, reviews };
}

function timeOf(value) {
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

// Date la plus recente (ms) parmi les lignes d'historique, ou null s'il n'y en a aucune de valide.
export function maxChangedAt(rows) {
  if (!Array.isArray(rows)) return null;
  let max = null;
  rows.forEach((r) => {
    const t = r ? timeOf(r.changed_at) : null;
    if (t !== null && (max === null || t > max)) max = t;
  });
  return max;
}

// Une ligne d'historique est-elle une nouveaute pour cette commande ?
export function isOrderNewsEvent(row, order) {
  if (!row || !order) return false;
  if (row.par_moi === true) return false;
  switch (row.status) {
    case "shipped":
    case "delivered":
      return true;
    case "paid":
      return order.payment_method === "transfer";
    case "cancelled":
      return order.cancelled_by === "system";
    default:
      return false;
  }
}

// Seuil au-dela duquel un evenement de cette commande est nouveau : depart du compte, releve par
// la derniere ouverture de la commande. null tant que le point de depart n'est pas pose.
export function eventFloor(store, orderId) {
  if (!store || store.orders === null || store.orders === undefined) return null;
  const s = store.seen && typeof store.seen === "object" ? store.seen[String(orderId)] : undefined;
  return typeof s === "number" && s > store.orders ? s : store.orders;
}

// { idCommande: nombre d'evenements nouveaux } pour les commandes affichees qui en ont au moins un.
export function orderNewsByOrder(rows, orders, store) {
  const out = {};
  if (!Array.isArray(rows) || !Array.isArray(orders)) return out;
  const byId = new Map();
  orders.forEach((o) => { if (o) byId.set(String(o.id), o); });
  rows.forEach((r) => {
    if (!r) return;
    const floor = eventFloor(store, r.order_id);
    if (floor === null) return;
    const t = timeOf(r.changed_at);
    if (t === null || t <= floor) return;
    if (!isOrderNewsEvent(r, byId.get(String(r.order_id)))) return;
    const k = String(r.order_id);
    out[k] = (out[k] || 0) + 1;
  });
  return out;
}

// Nombre total d'evenements de commande nouveaux.
export function countOrderNews(rows, orders, store) {
  const map = orderNewsByOrder(rows, orders, store);
  return Object.keys(map).reduce((n, k) => n + map[k], 0);
}

// Identifiants des commandes ayant du nouveau, de la plus recemment concernee a la plus ancienne.
// Chaque identifiant garde le type de la commande (nombre ou texte) : il sert a ouvrir son detail.
export function newsOrderIds(rows, orders, store) {
  const map = orderNewsByOrder(rows, orders, store);
  const last = {};
  (Array.isArray(rows) ? rows : []).forEach((r) => {
    if (!r || !map[String(r.order_id)]) return;
    const t = timeOf(r.changed_at);
    if (t !== null && (last[String(r.order_id)] === undefined || t > last[String(r.order_id)])) last[String(r.order_id)] = t;
  });
  const ids = [];
  (Array.isArray(orders) ? orders : []).forEach((o) => { if (o && map[String(o.id)]) ids.push(o.id); });
  return ids.sort((a, b) => (last[String(b)] || 0) - (last[String(a)] || 0));
}

// Signature d'un avis : statut + presence (et date) de la reponse.
export function reviewSignature(r) {
  if (!r) return "";
  const reply = r.reply ? String(r.reply_at || "1") : "";
  return String(r.status || "") + "|" + reply;
}

export function reviewSignatures(reviews) {
  const map = {};
  if (!Array.isArray(reviews)) return map;
  reviews.forEach((r) => { if (r && r.id !== null && r.id !== undefined) map[String(r.id)] = reviewSignature(r); });
  return map;
}

function isNotifiableReview(r) {
  return Boolean(r) && (r.status === "published" || r.status === "refused");
}

// Identifiants (texte) des avis publies, refuses ou repondus depuis le dernier « vu ».
export function newReviewIds(reviews, store) {
  if (!Array.isArray(reviews) || !store || !store.reviews) return [];
  const ids = [];
  reviews.forEach((r) => {
    if (!isNotifiableReview(r)) return;
    const seen = Object.prototype.hasOwnProperty.call(store.reviews, String(r.id)) ? store.reviews[String(r.id)] : "";
    if (reviewSignature(r) !== seen) ids.push(String(r.id));
  });
  return ids;
}

// Nombre d'avis publies, refuses ou repondus depuis le dernier « vu » (un avis compte une fois).
export function countReviewNews(reviews, store) {
  return newReviewIds(reviews, store).length;
}

// Complete le point de depart pour les parties encore a null, des que leur lecture a reussi.
// Renvoie le meme objet s'il n'y a rien a completer.
export function fillBaseline(store, rows, reviews) {
  let next = store;
  if ((next.orders === null || next.orders === undefined) && Array.isArray(rows)) {
    const max = maxChangedAt(rows);
    next = { ...next, orders: max === null ? 0 : max };
  }
  if ((next.reviews === null || next.reviews === undefined) && Array.isArray(reviews)) {
    next = { ...next, reviews: reviewSignatures(reviews) };
  }
  return next;
}

// V2 : ouverture du detail d'une commande -> ses evenements sont vus. Meme objet si rien ne change.
export function markOrderSeen(store, orderId, rows) {
  if (!store || orderId === null || orderId === undefined) return store;
  const floor = eventFloor(store, orderId);
  if (floor === null || !Array.isArray(rows)) return store;
  const mine = rows.filter((r) => r && String(r.order_id) === String(orderId));
  const max = maxChangedAt(mine);
  if (max === null || max <= floor) return store;
  return { ...store, seen: { ...(store.seen || {}), [String(orderId)]: max } };
}

// Tout marquer comme vu d'un coup (conserve pour memoire ; le branchement V2 n'appelle plus cette fonction).
export function markOrdersSeen(store, rows) {
  if (!store || store.orders === null || store.orders === undefined) return store;
  const max = maxChangedAt(rows);
  if (max === null || max <= store.orders) return store;
  return { ...store, orders: max };
}

// Ouverture de « Mes avis » : tous les avis actuels sont vus. Meme objet si rien ne change.
export function markReviewsSeen(store, reviews) {
  if (!store || !store.reviews || !Array.isArray(reviews)) return store;
  const next = reviewSignatures(reviews);
  const a = Object.keys(next);
  const b = Object.keys(store.reviews);
  const same = a.length === b.length && a.every((k) => store.reviews[k] === next[k]);
  return same ? store : { ...store, reviews: next };
}

// Libelle de la pastille : plafonne a « 9+ ».
export function formatBadge(n) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v) || v <= 0) return "";
  return v > 9 ? "9+" : String(v);
}
