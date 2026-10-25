// ============================================================
// RÉGLAGE CGV (conditions générales de vente)
// ============================================================
// Stocké dans site_settings sous une clé dédiée, séparée de site_texts,
// pour que la date de mise à jour affichée reflète uniquement une
// vraie modification des CGV (et non celle d'un autre texte du site).
// La lecture publique et le contrôle de cette clé sont déjà installés
// (policy site_settings_select_public).
// ============================================================
export const CGV_KEY = "cgv_text";
export const CGV_MAX_LENGTH = 8000;

export const DEFAULT_CGV_TEXT = "";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

// Depuis la base (value JSON) vers le texte affiché. Ne lève jamais
// d'erreur : en cas de problème, retourne le texte par défaut.
export function resolveCgvText(value) {
  try {
    if (value && typeof value === "object" && typeof value.text === "string") {
      return value.text;
    }
  } catch (e) {
    // réglage illisible : texte par défaut
  }
  return DEFAULT_CGV_TEXT;
}

// Valide un texte saisi dans l'admin avant enregistrement.
// Retourne null si valide, ou un message d'erreur sinon.
export function cgvTextProblem(text) {
  const n = normalizeText(text);
  if (n.length === 0) return "Le texte des CGV ne peut pas être vide.";
  if (n.length > CGV_MAX_LENGTH) {
    return `Le texte des CGV dépasse la limite de ${CGV_MAX_LENGTH} caractères (actuellement ${n.length}).`;
  }
  return null;
}

// Construit la valeur JSON à enregistrer en base.
export function buildCgvValue(text) {
  return { text: normalizeText(text) };
}

// Lecture côté site public. Ne lève jamais d'erreur : en cas de
// problème, le texte par défaut est renvoyé.
export async function fetchCgvText(client, table = "site_settings") {
  try {
    const res = await client.from(table).select("value, updated_at").eq("key", CGV_KEY).maybeSingle();
    if (res && !res.error && res.data) {
      return { text: resolveCgvText(res.data.value), updatedAt: res.data.updated_at || null };
    }
  } catch (e) {
    // réglage illisible : texte par défaut
  }
  return { text: DEFAULT_CGV_TEXT, updatedAt: null };
}