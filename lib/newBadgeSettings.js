// ZENORIA_NEW_BADGE_V2
// ============================================================
// lib/newBadgeSettings.js : outils du réglage d'administration du badge « Nouveauté » (logique pure, sans React ni appel réseau).
//
// Ce fichier complète lib/newBadge.js (qui reste inchangé : durée, dates, lecture du réglage par le site).
// Il sert à la carte « Badge Nouveauté » de l'administration : validation de la saisie, valeur à enregistrer,
// texte du réglage, aperçu (nombre de bijoux concernés) et messages d'erreur lisibles.
// ============================================================
import { NEW_BADGE_MIN_DAYS, NEW_BADGE_MAX_DAYS, parseNewBadgeSetting, isNewProduct } from "@/lib/newBadge";

const DAYS_ERROR = "Indiquez un nombre entier de jours, de " + NEW_BADGE_MIN_DAYS + " à " + NEW_BADGE_MAX_DAYS + ".";

// Saisie de la durée (texte du champ) -> { ok: true, days } ou { ok: false, error }.
// Accepte uniquement des chiffres (« 14 », « 014 », « 14 » entouré d'espaces) ; refuse 14,5, 1e1, -3, « abc », vide, 0 et plus de 90.
export function parseDaysInput(text) {
  const raw = typeof text === "number" && Number.isFinite(text) ? String(text) : typeof text === "string" ? text.trim() : "";
  if (raw === "") return { ok: false, error: "Indiquez la durée d'affichage, en jours." };
  if (!/^[0-9]{1,4}$/.test(raw)) return { ok: false, error: DAYS_ERROR };
  const days = Number(raw);
  if (days < NEW_BADGE_MIN_DAYS || days > NEW_BADGE_MAX_DAYS) return { ok: false, error: DAYS_ERROR };
  return { ok: true, days };
}

// Valeur enregistrée dans site_settings (exactement les deux champs attendus par la contrainte SQL).
export function buildNewBadgeValue(enabled, days) {
  return { enabled: enabled === true, days };
}

export function sameNewBadgeSetting(a, b) {
  const x = parseNewBadgeSetting(a);
  const y = parseNewBadgeSetting(b);
  return x.enabled === y.enabled && x.days === y.days;
}

export function plural(n, one, many) {
  return n + " " + (n > 1 ? many : one);
}

// « Activé · 14 jours » / « Désactivé »
export function describeNewBadgeSetting(setting) {
  const cfg = parseNewBadgeSetting(setting);
  return cfg.enabled ? "Activé · " + plural(cfg.days, "jour", "jours") : "Désactivé";
}

// Nombre de bijoux EN LIGNE qui afficheraient le badge avec ce réglage (aperçu avant enregistrement).
export function countNewProducts(products, setting, nowMs) {
  if (!Array.isArray(products)) return null;
  return products.filter((p) => p && p.active !== false && isNewProduct(p.created_at, setting, nowMs)).length;
}

// Texte de l'aperçu sous le champ de durée
export function previewText(count, setting) {
  const cfg = parseNewBadgeSetting(setting);
  if (!cfg.enabled) return "Le badge est désactivé : aucun bijou ne l'affiche.";
  if (count === null || count === undefined) return "Aperçu indisponible (les bijoux n'ont pas pu être lus).";
  if (count === 0) return "Avec ce réglage, aucun bijou n'affiche le badge actuellement.";
  return "Avec ce réglage, " + count + " bijou" + (count > 1 ? "x affichent" : " affiche") + " le badge actuellement.";
}

// Erreur technique -> message lisible
export function newBadgeErrorMessage(err) {
  const msg = err && err.message ? err.message : typeof err === "string" ? err : "";
  if (/violates check constraint|site_settings_[a-z_]+_valid/i.test(msg)) {
    return "La base refuse cette valeur (règle de validation) : indiquez un nombre entier de jours, de " + NEW_BADGE_MIN_DAYS + " à " + NEW_BADGE_MAX_DAYS + ".";
  }
  if (/row-level security|permission denied|not authorized|unauthorized|jwt/i.test(msg)) {
    return "Modification refusée : ce compte n'a pas les droits d'administration.";
  }
  if (/relation|does not exist|schema cache|could not find the table/i.test(msg)) {
    return "La table des réglages est introuvable. Vérifiez que supabase_site_settings.sql a été exécuté.";
  }
  if (/failed to fetch|network|timeout/i.test(msg)) {
    return "Connexion impossible. Réessayez dans un instant.";
  }
  return "Échec de l'enregistrement" + (msg ? " (" + msg + ")" : "") + ".";
}

export function isDuplicateKeyError(err) {
  const code = err && err.code ? String(err.code) : "";
  const msg = err && err.message ? err.message : "";
  return code === "23505" || /duplicate key/i.test(msg);
}
