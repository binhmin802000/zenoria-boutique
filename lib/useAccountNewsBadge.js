import { useEffect, useRef, useState } from "react"; // ZENORIA_ACCOUNT_NEWS_BADGE_V1
import { supabase } from "./supabase.js";
import { storageKey, parseStore } from "./accountNews.js";
import { badgeCacheKey, parseBadgeFetchCache, isBadgeFetchFresh, countBadgeTotal } from "./accountNewsBadge.js";

// ============================================================
// Pastille de nouveautes pour les pages AUTRES que Mon compte (Accueil, quiz...).
//
//  userId         : identifiant du compte connecte, ou null (visiteuse non connectee -> aucun appel)
//  settingsReady  : true quand le reglage admin (interrupteur + duree de cache) a ete lu
//  enabled        : interrupteur admin. Faux -> aucun appel, pastille toujours a 0 sur ces pages
//                   (sans effet sur Mon compte, qui a son propre appel, deja en production)
//  cacheMinutes   : duree (minutes) pendant laquelle les donnees reseau sont reutilisees sans nouvel appel
//
// Le cache (sessionStorage, par onglet) porte sur les donnees reseau (rows/reviews), pas sur le total
// affiche : le total est toujours recalcule avec la memoire « vu » (localStorage) la plus recente, donc
// une visite de Mon compte dans le meme onglet se reflete immediatement, meme avec un cache encore valide.
// ============================================================
function readFetchCache(userId) {
  try {
    return parseBadgeFetchCache(window.sessionStorage.getItem(badgeCacheKey(userId)));
  } catch (e) {
    return null;
  }
}

function writeFetchCache(userId, rows, reviews) {
  try {
    window.sessionStorage.setItem(badgeCacheKey(userId), JSON.stringify({ rows, reviews, at: Date.now() }));
  } catch (e) {
    // stockage indisponible (navigation privee...) : le cache ne sert simplement pas pour cette visite
  }
}

function readSeenStore(userId) {
  try {
    return parseStore(window.localStorage.getItem(storageKey(userId)));
  } catch (e) {
    return null;
  }
}

export function useAccountNewsBadge({ userId, settingsReady, enabled, cacheMinutes }) {
  const [count, setCount] = useState(0);
  const fetchingRef = useRef(false);

  useEffect(() => {
    if (!settingsReady || !userId || !enabled) {
      setCount(0);
      return undefined;
    }
    let alive = true;
    const applyFromCache = (rows, reviews) => setCount(countBadgeTotal(rows, reviews, readSeenStore(userId)));

    const cached = readFetchCache(userId);
    if (isBadgeFetchFresh(cached, cacheMinutes, Date.now())) {
      applyFromCache(cached.rows, cached.reviews);
      return undefined;
    }
    if (fetchingRef.current) return undefined;
    fetchingRef.current = true;
    Promise.all([supabase.rpc("customer_account_news"), supabase.rpc("customer_account_reviews")]).then(([a, b]) => {
      fetchingRef.current = false;
      if (!alive) return;
      const rows = a && !a.error && Array.isArray(a.data) ? a.data : [];
      const reviews = b && !b.error && Array.isArray(b.data) ? b.data : [];
      writeFetchCache(userId, rows, reviews);
      applyFromCache(rows, reviews);
    });
    return () => {
      alive = false;
    };
  }, [userId, settingsReady, enabled, cacheMinutes]);

  return count;
}
