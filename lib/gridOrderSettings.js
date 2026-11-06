import {
  DEFAULT_GRID_ORDER,
  GRID_ORDER_MIN_DAYS,
  GRID_ORDER_MAX_DAYS,
  GRID_ORDER_ANCHOR_DAY,
  GRID_ORDER_ROTATION_HOUR,
  parseGridOrderSetting,
  periodIndex,
} from "./gridOrder.js";
import { addDaysToParisDay } from "./dates.js";
import { parisOffsetMinutes } from "./parisTime.js";

// ============================================================
// RÉGLAGE « ORDRE DES BIJOUX » (administration) — ZENORIA_GRID_ORDER_V3
//
// Enregistré dans la table site_settings, clé « grid_order » (voir sql/supabase_grid_order.sql) :
//     { "mode": "random" | "manual", "everyDays": 1 à 30, "shuffledAt": "" }
// Ce fichier contient tout ce que le panneau d'administration décide : lecture de la saisie, valeur à enregistrer, comparaison,
// bornes de la période en cours, textes. Le panneau (components/AdminGridOrder.js) ne fait que l'afficher.
// Le calcul de l'ordre lui-même est dans lib/gridOrder.js.
// ============================================================
export const GRID_ORDER_KEY = "grid_order";
const TIME_ZONE = "Europe/Paris";

// Saisie de la fréquence : « 7 », « 07 », « 7 jours » ; un nombre entier de 1 à 30
export function parseEveryDaysInput(text) {
  const t = String(text === null || text === undefined ? "" : text)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/ ?(jours?|j)$/, "");
  if (!/^\d{1,3}$/.test(t)) return { ok: false, value: null, error: "Saisissez un nombre entier de jours, de " + GRID_ORDER_MIN_DAYS + " à " + GRID_ORDER_MAX_DAYS + "." };
  const n = Number(t);
  if (n < GRID_ORDER_MIN_DAYS || n > GRID_ORDER_MAX_DAYS) {
    return { ok: false, value: null, error: "La fréquence doit être comprise entre " + GRID_ORDER_MIN_DAYS + " et " + GRID_ORDER_MAX_DAYS + " jours." };
  }
  return { ok: true, value: n, error: "" };
}

// Valeur à enregistrer : toujours complète et valide
export function buildGridOrderValue(s) {
  const p = parseGridOrderSetting(s);
  return { mode: p.mode, everyDays: p.everyDays, shuffledAt: p.shuffledAt };
}

// « Mélanger maintenant » : le réglage actuel, avec l'instant du mélange. null si l'instant est illisible.
export function shuffledValue(current, nowMs) {
  const t = Number(nowMs);
  if (!Number.isFinite(t)) return null;
  let iso = "";
  try {
    iso = new Date(t).toISOString();
  } catch (e) {
    return null;
  }
  const p = parseGridOrderSetting(current);
  return { mode: p.mode, everyDays: p.everyDays, shuffledAt: iso };
}

// Deux réglages sont-ils identiques pour le formulaire ? (la date du dernier mélange ne se saisit pas : elle est exclue)
export function sameGridOrderSetting(a, b) {
  const x = parseGridOrderSetting(a);
  const y = parseGridOrderSetting(b);
  return x.mode === y.mode && x.everyDays === y.everyDays;
}

// Instant (millisecondes UTC) de « 3 h 00 à Paris » pour un jour « AAAA-MM-JJ », changements d'heure compris. NaN si le jour est illisible.
export function parisRotationMs(day) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ""));
  if (!m) return NaN;
  const local = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), GRID_ORDER_ROTATION_HOUR, 0, 0);
  let t = local - parisOffsetMinutes(local) * 60000;
  t = local - parisOffsetMinutes(t) * 60000; // deuxième passage : traverse un changement d'heure
  return t;
}

// Période en cours : son numéro, son début et le prochain changement d'ordre (instants UTC en millisecondes)
export function periodBounds(nowMs, everyDays) {
  const n = Number.isInteger(everyDays) && everyDays >= GRID_ORDER_MIN_DAYS ? everyDays : DEFAULT_GRID_ORDER.everyDays;
  const period = periodIndex(nowMs, n);
  return {
    period,
    startMs: parisRotationMs(addDaysToParisDay(GRID_ORDER_ANCHOR_DAY, period * n)),
    nextMs: parisRotationMs(addDaysToParisDay(GRID_ORDER_ANCHOR_DAY, (period + 1) * n)),
  };
}

// « lundi 16 novembre à 03:00 » (heure de Paris)
export function formatGridMoment(ms) {
  if (!Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleString("fr-FR", { timeZone: TIME_ZONE, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

// « 6 novembre 2026 à 14:32 » (heure de Paris) ; « jamais » si le réglage n'a jamais été mélangé à la main
export function formatShuffleMoment(iso) {
  const t = typeof iso === "string" && iso !== "" ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return "jamais";
  return new Date(t).toLocaleString("fr-FR", { timeZone: TIME_ZONE, day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Texte du réglage enregistré, pour l'administration
export function describeGridOrder(setting) {
  const s = parseGridOrderSetting(setting);
  if (s.mode === "manual") return "manuel : les bijoux s'affichent dans l'ordre de la base";
  return "aléatoire, nouvel ordre " + (s.everyDays === 1 ? "chaque jour" : "tous les " + s.everyDays + " jours") + " à 3 h (heure de Paris)";
}

// Libellés du journal des changements (lot C5) : valeur lisible d'un champ du réglage.
// Renvoie null pour tout ce qui n'est pas propre à ce réglage : le journal garde alors son affichage habituel.
// (Les valeurs « random » et « manual » n'existent dans aucun autre réglage : « mode » des autres vaut auto, forced, off, once, loop, vanish, full, stars.)
export function formatGridOrderLogValue(field, v) {
  if (field === "mode") {
    if (v === "random") return "aléatoire";
    if (v === "manual") return "ordre de la base";
  }
  if (field === "everyDays") {
    const n = Number(v);
    if (Number.isFinite(n)) return n + (n > 1 ? " jours" : " jour");
  }
  if (field === "shuffledAt") return formatShuffleMoment(v);
  return null;
}
