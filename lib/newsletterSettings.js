// ZENORIA_NEWSLETTER_V1 : réglage "newsletter" de site_settings (visibilité de la section accueil).
// Même format que lib/reviewsSettings.js : une clé, un parseur qui ne renvoie jamais autre chose
// qu'une forme valide (ligne absente ou illisible -> valeur par défaut, section masquée).
export const NEWSLETTER_KEY = "newsletter";

export const DEFAULT_NEWSLETTER = Object.freeze({ enabled: false });

export function parseNewsletterSetting(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_NEWSLETTER };
  return { enabled: value.enabled === true };
}
