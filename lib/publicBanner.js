// ============================================================
// publicBanner.js — quel BANDEAU afficher sur le site, et mémoire des bandeaux fermés
//
// Logique pure, sans React. Les bandeaux viennent de la table « banners » :
//  - pour une VISITEUSE, la base ne renvoie que les bandeaux activés et EN COURS (selon l'horloge de la base de données).
//    On lui fait confiance pour le début : l'horloge d'un navigateur peut être décalée. Seule la FIN est revérifiée ici,
//    pour qu'un bandeau disparaisse sans recharger la page ;
//  - pour un ADMINISTRATEUR, la base renvoie tout : on vérifie aussi le début (checkStart), afin qu'un bandeau programmé
//    ne s'affiche pas trop tôt ;
//  - un seul bandeau à la fois : le plus prioritaire (1 = en premier), puis le plus récent ;
//  - un bandeau lié à un code promo qui n'est plus valable n'est jamais affiché : il promettrait un code inutilisable ;
//  - pendant une pause de la boutique ou une maintenance, aucun bandeau n'est affiché ;
//  - une visiteuse qui ferme un bandeau ne le revoit plus pendant sa visite (jusqu'à ce qu'il soit modifié).
// ============================================================

export const BANNER_STORAGE_KEY = "zenoria_banner_closed_v1";
const MAX_KEYS = 50;

// Clé d'un bandeau : son identifiant et sa dernière modification. Un bandeau modifié redevient visible pour qui l'avait fermé.
export function bannerKey(b) {
  return String((b && b.id) === undefined || (b && b.id) === null ? "" : b.id) + "@" + String((b && b.updated_at) || "");
}

// options : { paused, closedKeys, validCodes (Set de codes valables, ou null pour ne pas vérifier), checkStart }
export function pickPublicBanner(rows, nowMs, options = {}) {
  const { paused = false, closedKeys = [], validCodes = null, checkStart = false } = options;
  if (paused || !Array.isArray(rows)) return null;
  const closed = new Set(closedKeys);
  const usable = rows.filter((b) => {
    if (!b || b.enabled === false) return false;
    if (!b.message || !String(b.message).trim()) return false;
    const end = Date.parse(b.ends_at);
    if (!Number.isFinite(end) || !(nowMs < end)) return false;
    if (checkStart) {
      const start = Date.parse(b.starts_at);
      if (!Number.isFinite(start) || nowMs < start) return false;
    }
    if (b.code && validCodes && !validCodes.has(b.code)) return false;
    if (closed.has(bannerKey(b))) return false;
    return true;
  });
  usable.sort(
    (a, b) =>
      (Number(a.priority) || 1) - (Number(b.priority) || 1) ||
      (Date.parse(b.starts_at) || 0) - (Date.parse(a.starts_at) || 0) ||
      (Number(a.id) || 0) - (Number(b.id) || 0)
  );
  return usable[0] || null;
}

// ------------------------------------------------------------
// Mémoire des bandeaux fermés (sessionStorage : elle dure le temps de la visite)
// ------------------------------------------------------------
export function getSessionStorage() {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch (e) {
    return null; // accès refusé (navigation privée stricte, cookies bloqués)
  }
}

export function readClosedKeys(storage) {
  try {
    const raw = storage ? storage.getItem(BANNER_STORAGE_KEY) : null;
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((k) => typeof k === "string").slice(-MAX_KEYS) : [];
  } catch (e) {
    return [];
  }
}

export function writeClosedKeys(storage, keys) {
  try {
    if (!storage) return false;
    storage.setItem(BANNER_STORAGE_KEY, JSON.stringify((keys || []).slice(-MAX_KEYS)));
    return true;
  } catch (e) {
    return false;
  }
}
