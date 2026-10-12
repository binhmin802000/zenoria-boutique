// ============================================================
// parisTime.js — dates et heures en heure de Paris (Europe/Paris), sans bibliothèque externe
//
// Pourquoi : les champs « date et heure » d'un navigateur donnent une heure LOCALE sans fuseau
// (« 2026-12-01T00:00 »). La base de données, elle, stocke des instants précis (UTC). Ce fichier
// convertit dans les deux sens en tenant compte du passage heure d'été / heure d'hiver, pour que
// « 1er décembre 00:00 » veuille toujours dire minuit à Paris, quel que soit le fuseau de l'ordinateur.
//
// Format des champs de saisie : « AAAA-MM-JJTHH:mm » (celui de <input type="datetime-local">).
// ============================================================

export const PARIS_TZ = "Europe/Paris";

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: PARIS_TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function partsOf(utcMs) {
  const out = {};
  partsFormatter.formatToParts(new Date(utcMs)).forEach((p) => {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  });
  return out;
}

// Décalage de Paris par rapport à UTC, en minutes, à un instant donné (60 en hiver, 120 en été)
export function parisOffsetMinutes(utcMs) {
  const p = partsOf(utcMs);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60000);
}

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

// « 2026-12-01T00:00 » (heure de Paris) -> instant ISO UTC ; null si la saisie est vide ou invalide.
// Heure inexistante (saut d'heure du printemps) : on prend l'heure suivante. Heure en double (retour
// d'automne) : on prend la première occurrence.
export function parisLocalToISO(local) {
  if (typeof local !== "string") return null;
  const m = LOCAL_RE.exec(local.trim());
  if (!m) return null;
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6] || "0"].map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  const check = new Date(asUtc);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null; // 31 février, etc.
  // Deux candidats (heure d'hiver et heure d'été) : on garde celui qui, converti en heure de Paris, redonne la saisie.
  const candidates = [asUtc - 120 * 60000, asUtc - 60 * 60000];
  const wanted = Date.UTC(y, mo - 1, d, h, mi, s);
  const valid = candidates.filter((c) => {
    const p = partsOf(c);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) === wanted;
  });
  let utc;
  if (valid.length === 0) {
    // Heure inexistante (saut du printemps) : on applique le décalage d'avant le saut, ce qui donne l'heure suivante
    utc = asUtc - 60 * 60000;
  } else {
    utc = Math.min(...valid); // en double : la première occurrence (la plus tôt)
  }
  return new Date(utc).toISOString();
}

// Instant ISO -> « AAAA-MM-JJTHH:mm » en heure de Paris ; chaîne vide si invalide
export function isoToParisLocal(iso) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const p = partsOf(t);
  const pad = (n, l = 2) => String(n).padStart(l, "0");
  return pad(p.year, 4) + "-" + pad(p.month) + "-" + pad(p.day) + "T" + pad(p.hour) + ":" + pad(p.minute);
}

// Affichage lisible : « 01/12/2026 00:00 » (heure de Paris) ; « — » si vide
export function formatParis(iso) {
  const local = isoToParisLocal(iso);
  if (!local) return "—";
  const [d, t] = local.split("T");
  const [y, mo, da] = d.split("-");
  return da + "/" + mo + "/" + y + " " + t;
}

// Date seule : « 1 décembre » (pour « jusqu'au {fin} »)
export function formatParisDay(iso) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: PARIS_TZ }).format(new Date(t));
}

// Ajoute des JOURS CALENDAIRES en gardant la même heure à Paris (5 jours après le 20 octobre 10:00 = le 25 octobre 10:00,
// même si les horloges changent d'heure entre-temps).
export function addDaysParis(iso, days) {
  const local = isoToParisLocal(iso);
  if (!local) return null;
  const m = LOCAL_RE.exec(local);
  const [y, mo, d, h, mi] = [m[1], m[2], m[3], m[4], m[5]].map(Number);
  const shifted = new Date(Date.UTC(y, mo - 1, d + Number(days), h, mi));
  const pad = (n, l = 2) => String(n).padStart(l, "0");
  const next =
    pad(shifted.getUTCFullYear(), 4) + "-" + pad(shifted.getUTCMonth() + 1) + "-" + pad(shifted.getUTCDate()) + "T" + pad(shifted.getUTCHours()) + ":" + pad(shifted.getUTCMinutes());
  return parisLocalToISO(next);
}

// Nombre de jours calendaires entre deux instants (arrondi), au moins 1
export function daysBetween(startIso, endIso) {
  const a = new Date(startIso).getTime();
  const b = new Date(endIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 1;
  return Math.max(1, Math.round((b - a) / 86400000));
}

// Prochaine heure pleine (en millisecondes), pour proposer une date de début par défaut
export function nextFullHour(nowMs) {
  const h = 3600000;
  return Math.ceil(nowMs / h) * h;
}
