// ============================================================
// lib/accountLink.js — ZENORIA_ACCOUNT_PANIER_V1
//
// Lien vers l'icone compte du header partage, pour les pages qui ne connaissent pas deja
// la session (quiz, pages legales) : connectee -> /compte ; sinon -> /?connexion=compte
// (l'accueil ouvre alors la fenetre de connexion, mecanisme existant : voir pages/index.js,
// ZENORIA_ACCOUNT_STEP11_V1). « Version simple » : un seul appel a la connexion de la page,
// sans suivre les changements de session ensuite (pas de onAuthStateChange ici).
// ============================================================
export const DEFAULT_ACCOUNT_HREF = "/?connexion=compte";

export async function fetchAccountHref(client) {
  try {
    const { data } = await client.auth.getSession();
    return data && data.session ? "/compte" : DEFAULT_ACCOUNT_HREF;
  } catch (e) {
    return DEFAULT_ACCOUNT_HREF;
  }
}

// Lecture du navigateur sans jamais lever d'erreur (meme principe que getLocalStorage() de pages/quiz.js)
export function safeLocalStorage() {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch (e) {
    return null;
  }
}
