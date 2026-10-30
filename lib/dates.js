// ============================================================
// UTILITAIRE DE DATES PARTAGE — ZENORIA_DATES_V1
// Toutes les dates de l'application sont des instants (UTC en base). Pour l'affichage et pour les regles metier
// (echeance, retard, filtres), c'est le JOUR CALENDAIRE DE PARIS (Europe/Paris) qui compte, ete comme hiver :
// le changement d'heure est gere par le fuseau, jamais par un decalage ecrit a la main.
// Les « jours » manipules ici sont des chaines "AAAA-MM-JJ".
// ============================================================
export const PARIS_TIME_ZONE = "Europe/Paris";

// Jour calendaire de Paris d'un instant (Date, nombre de millisecondes ou chaine ISO). "" si la valeur est invalide.
export function parisDay(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("sv-SE", { timeZone: PARIS_TIME_ZONE }); // AAAA-MM-JJ
}

function dayToUtcMs(day) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ""));
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN;
}

// Nombre de jours calendaires entre deux jours "AAAA-MM-JJ" : positif si toDay est apres fromDay. 0 si une valeur est invalide.
export function parisDayDiff(fromDay, toDay) {
  const a = dayToUtcMs(fromDay);
  const b = dayToUtcMs(toDay);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}

// Ajoute (ou retire, si n est negatif) n jours calendaires a un jour "AAAA-MM-JJ". Chaine vide si le jour est invalide.
export function addDaysToParisDay(day, n) {
  const t = dayToUtcMs(day);
  if (Number.isNaN(t)) return "";
  return new Date(t + Number(n) * 86400000).toISOString().slice(0, 10);
}

export function formatParisDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("fr-FR", { timeZone: PARIS_TIME_ZONE });
}

export function formatParisDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: PARIS_TIME_ZONE });
}
