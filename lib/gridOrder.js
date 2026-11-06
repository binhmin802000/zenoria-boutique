import { parisDay, parisDayDiff, addDaysToParisDay } from "./dates.js";
import { parisOffsetMinutes } from "./parisTime.js";

// ============================================================
// ORDRE DES BIJOUX DE LA GRILLE D'ACCUEIL — ZENORIA_GRID_ORDER_V1
//
// Logique pure, sans React ni appel réseau. Elle ne modifie jamais la liste des produits : elle renvoie un ordre
// d'identifiants, que la page applique seulement à la grille « Nos créations » (le visuel d'en-tête et le bloc Savoir-faire
// continuent de lire products[0] dans l'ordre de la base).
//
// L'ordre ne dépend que :
//   - de la période en cours : elle change à 3 h, heure de Paris, tous les N jours (N de 1 à 30) ;
//   - du réglage : mode, N et date du dernier « Mélanger maintenant » ;
//   - de l'identifiant de chaque bijou.
// Il est donc identique pour toutes les visiteuses au même instant, et un bijou ajouté ne bouleverse pas les autres.
// Les bijoux commandables passent avant les autres (en cours de commande, épuisés) ; chaque groupe est mélangé séparément.
//
// Réglage enregistré (table site_settings, lot R3) : { "mode": "random" | "manual", "everyDays": 1, "shuffledAt": "" }
//   mode       : « random » (aléatoire) ou « manual » (ordre de la base, comme avant)
//   everyDays  : nombre entier de jours entre deux changements d'ordre, de 1 à 30
//   shuffledAt : instant (ISO) du dernier « Mélanger maintenant » ; vide : jamais mélangé à la main
// Réglage absent ou illisible : aléatoire, tous les jours.
// ============================================================
export const GRID_ORDER_ROTATION_HOUR = 3;
export const GRID_ORDER_ANCHOR_DAY = "2026-01-05"; // un lundi : avec N = 7, le changement tombe le lundi à 3 h
export const GRID_ORDER_MIN_DAYS = 1;
export const GRID_ORDER_MAX_DAYS = 30;
export const DEFAULT_GRID_ORDER = Object.freeze({ mode: "random", everyDays: 1, shuffledAt: "" });

// Lit le réglage enregistré. Tout ce qui n'est pas reconnu redonne la valeur par défaut, champ par champ.
export function parseGridOrderSetting(value) {
  const v = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const n = Number(v.everyDays);
  const t = typeof v.shuffledAt === "string" && v.shuffledAt !== "" ? Date.parse(v.shuffledAt) : NaN;
  return {
    mode: v.mode === "manual" || v.mode === "random" ? v.mode : DEFAULT_GRID_ORDER.mode,
    everyDays: Number.isInteger(n) && n >= GRID_ORDER_MIN_DAYS && n <= GRID_ORDER_MAX_DAYS ? n : DEFAULT_GRID_ORDER.everyDays,
    shuffledAt: Number.isFinite(t) ? new Date(t).toISOString() : DEFAULT_GRID_ORDER.shuffledAt,
  };
}

// Heure (0 à 23) à Paris d'un instant, changements d'heure compris
export function parisHour(utcMs) {
  const local = utcMs + parisOffsetMinutes(utcMs) * 60000;
  return Math.floor((((local % 86400000) + 86400000) % 86400000) / 3600000);
}

// Jour « de rotation » : avant 3 h à Paris, on est encore dans la journée précédente
export function rotationDay(utcMs) {
  const day = parisDay(utcMs);
  return parisHour(utcMs) < GRID_ORDER_ROTATION_HOUR ? addDaysToParisDay(day, -1) : day;
}

// Numéro de la période en cours (entier, croissant) : change à 3 h, heure de Paris, tous les N jours
export function periodIndex(utcMs, everyDays) {
  const n = Number.isInteger(everyDays) && everyDays >= 1 ? everyDays : 1;
  return Math.floor(parisDayDiff(GRID_ORDER_ANCHOR_DAY, rotationDay(utcMs)) / n);
}

// Empreinte stable (FNV-1a puis mélange final) : même texte, même nombre, sur tous les navigateurs
export function hash32(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

// Liste des identifiants dans l'ordre d'affichage. isOrderable(produit) : vrai si la bague est commandable maintenant.
// À calculer UNE fois au chargement du catalogue : les mises à jour de stock ensuite ne déplacent plus rien.
export function gridOrderIds(products, { setting, nowMs, isOrderable } = {}) {
  const list = Array.isArray(products) ? products : [];
  const s = parseGridOrderSetting(setting);
  if (s.mode !== "random") return list.map((p) => p.id);
  const period = periodIndex(Number.isFinite(nowMs) ? nowMs : Date.now(), s.everyDays);
  const rows = list.map((p, i) => {
    let ok = true;
    try {
      ok = typeof isOrderable === "function" ? Boolean(isOrderable(p)) : true;
    } catch (e) {
      ok = true; // en cas de doute, la bague reste parmi les commandables
    }
    return { id: p.id, i, ok, k: hash32(s.shuffledAt + "|" + period + "|" + String(p.id)) };
  });
  rows.sort((a, b) => (a.ok === b.ok ? 0 : a.ok ? -1 : 1) || a.k - b.k || a.i - b.i);
  return rows.map((r) => r.id);
}

// Applique un ordre d'identifiants à une liste de produits. Un bijou absent de l'ordre (publié après le chargement) va à la fin.
export function applyIdOrder(products, ids) {
  const list = Array.isArray(products) ? products : [];
  const pos = new Map((Array.isArray(ids) ? ids : []).map((id, i) => [id, i]));
  return list
    .map((p, i) => ({ p, i, pos: pos.has(p.id) ? pos.get(p.id) : pos.size + i }))
    .sort((a, b) => a.pos - b.pos)
    .map((r) => r.p);
}
