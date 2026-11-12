// ZENORIA_TRANSFER_DUE_TIME_V1
// Date ET heure de l'échéance (annulation automatique) du virement, en fuseau Europe/Paris.
// L'échéance est déjà enregistrée en base à la fin de la journée (23 h 59, Europe/Paris) :
// cette fonction se contente de l'afficher dans ce même fuseau, sans jamais la recalculer.
// Format : « 13/11/2026 à 23 h 59 », identique au style déjà utilisé dans l'administration.
const TIME_ZONE = "Europe/Paris";

export function formatDueDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const date = d.toLocaleDateString("fr-FR", { timeZone: TIME_ZONE });
  const time = d.toLocaleTimeString("fr-FR", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false });
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  const hFormatted = m ? m[1] + " h " + m[2] : time;
  return date + " à " + hFormatted;
}
