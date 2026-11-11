import { useEffect, useMemo, useState } from "react"; // ZENORIA_ACCOUNT_NEWS_V1
import {
  storageKey,
  parseStore,
  emptyStore,
  fillBaseline,
  orderNewsByOrder,
  newsOrderIds,
  newReviewIds,
  countReviewNews,
  markOrderSeen,
  markReviewsSeen,
  formatBadge,
} from "./accountNews";

// ============================================================
// Branchement React des nouveautes de « Mon compte » (logique pure : lib/accountNews.js).
//
//  userId         : identifiant du compte connecte (null tant que inconnu)
//  ready          : true quand la lecture des commandes est terminee (reussie ou non)
//  orders         : commandes affichees a la cliente
//  rows           : lignes de customer_account_news() (null si la lecture a echoue)
//  reviews        : avis (id, status, reply, reply_at) (null si la lecture a echoue)
//  reviewsEnabled : false -> les avis ne sont pas comptes (rubrique masquee)
//  section        : rubrique ouverte ; ouvrir « avis » marque ces nouveautes comme vues
//  openOrderId    : (V2) commande dont le detail est ouvert ; l'ouvrir marque SES evenements comme vus
//
// Renvoie { total, byTab, tabLabels, orderNews, newsOrderIds, avisHighlight, ready } :
//  - orderNews     : { idCommande: nombre de nouveautes } (repere « Nouveau » dans la liste)
//  - newsOrderIds  : commandes ayant du nouveau, la plus recente d'abord (ouverture directe s'il n'y en a qu'une)
//  - avisHighlight : avis a reperer dans « Mes avis » pendant la visite de la rubrique (compteur deja remis a zero)
//  - ready         : la memoire du navigateur est lue (avant, aucune decision ne doit etre prise)
// La lecture du navigateur n'a lieu qu'apres l'affichage (effets), donc le rendu du serveur
// ne depend jamais de la memoire locale.
// ============================================================
function loadStore(userId) {
  try {
    return parseStore(window.localStorage.getItem(storageKey(userId)));
  } catch (e) {
    return null;
  }
}

function saveStore(userId, store) {
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(store));
  } catch (e) {
    // stockage indisponible (navigation privee...) : la memoire reste valable pour la visite en cours
  }
}

export function useAccountNews({ userId, ready, orders, rows, reviews, reviewsEnabled, section, openOrderId }) {
  const [store, setStore] = useState(null);
  const [avisHighlight, setAvisHighlight] = useState([]);

  // Point de depart : premiere visite du compte, ou completion apres une lecture qui avait echoue.
  useEffect(() => {
    if (!userId || !ready) return;
    const base = store || loadStore(userId) || emptyStore();
    const filled = fillBaseline(base, rows, reviews);
    if (filled !== base) saveStore(userId, filled);
    if (filled !== store) setStore(filled);
  }, [userId, ready, rows, reviews, store]);

  // V2 : ouvrir le detail d'une commande marque ses evenements comme vus (et seulement les siens).
  useEffect(() => {
    if (!userId || !store || openOrderId === null || openOrderId === undefined) return;
    const next = markOrderSeen(store, openOrderId, rows);
    if (next !== store) {
      saveStore(userId, next);
      setStore(next);
    }
  }, [userId, store, openOrderId, rows]);

  // Ouvrir « Mes avis » remet le compteur a zero ; les avis concernes restent reperes jusqu'a la sortie de la rubrique.
  useEffect(() => {
    if (section !== "avis") {
      setAvisHighlight((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    if (!userId || !store || !reviewsEnabled) return;
    const fresh = newReviewIds(reviews, store);
    if (fresh.length > 0) setAvisHighlight((prev) => Array.from(new Set(prev.concat(fresh))));
    const next = markReviewsSeen(store, reviews);
    if (next !== store) {
      saveStore(userId, next);
      setStore(next);
    }
  }, [userId, store, section, reviews, reviewsEnabled]);

  return useMemo(() => {
    const orderNews = orderNewsByOrder(rows, orders, store);
    const commandes = Object.keys(orderNews).reduce((n, k) => n + orderNews[k], 0);
    const avis = reviewsEnabled ? countReviewNews(reviews, store) : 0;
    return {
      total: commandes + avis,
      byTab: { commandes, avis },
      tabLabels: { commandes: formatBadge(commandes), avis: formatBadge(avis) },
      orderNews,
      newsOrderIds: newsOrderIds(rows, orders, store),
      avisHighlight,
      ready: store !== null,
    };
  }, [rows, orders, reviews, store, reviewsEnabled, avisHighlight]);
}
