import { useEffect, useMemo, useState } from "react"; // ZENORIA_ACCOUNT_NEWS_V1
import {
  storageKey,
  parseStore,
  emptyStore,
  fillBaseline,
  countOrderNews,
  countReviewNews,
  markOrdersSeen,
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
//  section        : rubrique ouverte ; ouvrir « commandes » ou « avis » marque ces nouveautes comme vues
//
// Renvoie { total, byTab: { commandes, avis }, tabLabels: { commandes, avis } }
// (libelles plafonnes a « 9+ », vides si 0). La lecture du navigateur n'a lieu qu'apres
// l'affichage (effets), donc le rendu du serveur ne depend jamais de la memoire locale.
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

export function useAccountNews({ userId, ready, orders, rows, reviews, reviewsEnabled, section }) {
  const [store, setStore] = useState(null);

  // Point de depart : premiere visite du compte, ou completion apres une lecture qui avait echoue.
  useEffect(() => {
    if (!userId || !ready) return;
    const base = store || loadStore(userId) || emptyStore();
    const filled = fillBaseline(base, rows, reviews);
    if (filled !== base) saveStore(userId, filled);
    if (filled !== store) setStore(filled);
  }, [userId, ready, rows, reviews, store]);

  // Ouverture d'une rubrique : ses nouveautes sont marquees comme vues.
  useEffect(() => {
    if (!userId || !store) return;
    let next = store;
    if (section === "commandes") next = markOrdersSeen(next, rows);
    if (section === "avis" && reviewsEnabled) next = markReviewsSeen(next, reviews);
    if (next !== store) {
      saveStore(userId, next);
      setStore(next);
    }
  }, [userId, store, section, rows, reviews, reviewsEnabled]);

  return useMemo(() => {
    const commandes = countOrderNews(rows, orders, store);
    const avis = reviewsEnabled ? countReviewNews(reviews, store) : 0;
    return {
      total: commandes + avis,
      byTab: { commandes, avis },
      tabLabels: { commandes: formatBadge(commandes), avis: formatBadge(avis) },
    };
  }, [rows, orders, reviews, store, reviewsEnabled]);
}
