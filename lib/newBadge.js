// ZENORIA_NEW_BADGE_V1
// ============================================================
// lib/newBadge.js : badge « Nouveauté » des bijoux (logique pure, sans React ni appel réseau).
//
// Un bijou est « nouveau » pendant N jours après sa DATE DE CRÉATION (products.created_at). Modifier un bijou
// ne le rend jamais « nouveau » : updated_at n'est pas utilisé.
// Étape 1 : valeurs par défaut (actif, 14 jours). Étape 2 : réglage d'administration (clé site_settings « new_badge »,
// valeur { enabled: boolean, days: entier de 1 à 90 }), lu avec parseNewBadgeSetting.
// ============================================================
export const NEW_BADGE_KEY = "new_badge";
export const NEW_BADGE_MIN_DAYS = 1;
export const NEW_BADGE_MAX_DAYS = 90;
export const DEFAULT_NEW_BADGE = { enabled: true, days: 14 };
const DAY_MS = 86400000;

// Réglage lu en base -> réglage utilisable. Ligne absente ou illisible : valeurs par défaut (actif, 14 jours).
export function parseNewBadgeSetting(value) {
  const v = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const enabled = typeof v.enabled === "boolean" ? v.enabled : DEFAULT_NEW_BADGE.enabled;
  const raw = typeof v.days === "string" && v.days.trim() !== "" ? Number(v.days) : v.days;
  const days =
    typeof raw === "number" && Number.isInteger(raw)
      ? Math.min(NEW_BADGE_MAX_DAYS, Math.max(NEW_BADGE_MIN_DAYS, raw))
      : DEFAULT_NEW_BADGE.days;
  return { enabled, days };
}

// createdAt : date de création (texte ISO ou Date). setting : réglage. nowMs : heure courante en millisecondes.
export function isNewProduct(createdAt, setting, nowMs) {
  const cfg = parseNewBadgeSetting(setting);
  if (!cfg.enabled) return false;
  let created = NaN;
  if (createdAt instanceof Date) created = createdAt.getTime();
  else if (typeof createdAt === "string") created = Date.parse(createdAt);
  if (!Number.isFinite(created)) return false;
  const now = typeof nowMs === "number" && Number.isFinite(nowMs) ? nowMs : Date.now();
  const age = now - created;
  if (age < -DAY_MS) return false; // création située dans le futur de plus d'un jour : donnée aberrante
  return age < cfg.days * DAY_MS;
}
