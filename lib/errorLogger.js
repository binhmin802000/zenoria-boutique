// ============================================================
// errorLogger.js - Journal des erreurs rencontrées par les visiteurs
//
// Quand une page rencontre une erreur (erreur JavaScript, promesse rejetée, plantage d'affichage,
// appel à Supabase qui échoue côté serveur ou côté réseau), un court rapport est envoyé à la
// fonction SQL log_client_error(). Il est consultable dans l'onglet « Santé » de /admin.
//
// DONNÉES ENREGISTRÉES (et rien d'autre) : type d'erreur, message nettoyé, page concernée
// (chemin sans paramètres), famille de navigateur et de système (ex. « Chrome 141 · Windows »).
// JAMAIS : adresse IP, adresse e-mail, identifiant de compte, contenu du panier, cookies.
// Les rapports identiques sont regroupés (compteur) et conservés 30 jours.
// Cette collecte est mentionnée dans la politique de confidentialité (pages/confidentialite.js).
//
// Garde-fous : 10 rapports par page au maximum, jamais deux fois le même, messages nettoyés
// (adresses e-mail, jetons et paramètres d'adresse retirés), erreurs d'extensions de navigateur
// ignorées. Si le script SQL n'est pas installé, l'envoi s'arrête de lui-même.
// ============================================================

const MAX_REPORTS_PER_PAGE = 10;
const MAX_MESSAGE_LENGTH = 300;

const state = { sent: new Set(), count: 0, disabled: false, diagnostic: false };

// Retire du message tout ce qui pourrait identifier une personne.
export function sanitizeMessage(raw) {
  let s = String(raw === undefined || raw === null ? "" : raw);
  s = s.replace(/(\/[^\s'")?#]*)\?[^\s'")]*/g, "$1"); // paramètres d'adresse
  s = s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]");
  s = s.replace(/[A-Za-z0-9_-]{32,}/g, "[jeton]"); // longues chaînes : jetons, identifiants
  s = s.replace(/\s+/g, " ").trim();
  return s.slice(0, MAX_MESSAGE_LENGTH);
}

// « Chrome 141 · Windows » : une famille, jamais la chaîne complète du navigateur.
export function uaFamily(ua) {
  const s = String(ua || "");
  let browser = "Navigateur";
  let m;
  if ((m = s.match(/Edg(?:e|A|iOS)?\/(\d+)/))) browser = "Edge " + m[1];
  else if ((m = s.match(/OPR\/(\d+)/))) browser = "Opera " + m[1];
  else if ((m = s.match(/Firefox\/(\d+)/)) || (m = s.match(/FxiOS\/(\d+)/))) browser = "Firefox " + m[1];
  else if ((m = s.match(/(?:Chrome|CriOS)\/(\d+)/))) browser = "Chrome " + m[1];
  else if ((m = s.match(/Version\/(\d+)[^]*Safari/))) browser = "Safari " + m[1];
  let os = "";
  if (/Windows/i.test(s)) os = "Windows";
  else if (/Android/i.test(s)) os = "Android";
  else if (/iPhone|iPad|iPod/i.test(s)) os = "iOS";
  else if (/Mac OS X|Macintosh/i.test(s)) os = "macOS";
  else if (/Linux/i.test(s)) os = "Linux";
  return (browser + (os ? " · " + os : "")).slice(0, 40);
}

// Erreurs sans intérêt : extensions de navigateur, bruit connu, interruptions voulues.
export function shouldIgnoreError(info) {
  const message = String((info && info.message) || "");
  const filename = String((info && info.filename) || "");
  if (/^(chrome|moz|safari|safari-web)-extension:\/\//i.test(filename)) return true;
  if (/ResizeObserver loop/i.test(message)) return true;
  if (/^Script error\.?$/i.test(message.trim())) return true; // erreur d'un script externe, sans détail exploitable
  if (/AbortError|The user aborted a request|signal is aborted/i.test(message)) return true;
  return false;
}

// À appeler pendant l'exécution d'un diagnostic : les échecs voulus ne doivent pas polluer le journal.
export function setDiagnosticMode(on) {
  state.diagnostic = Boolean(on);
}

export function reportClientError(kind, rawMessage) {
  if (typeof window === "undefined" || state.disabled) return;
  if (state.diagnostic && kind === "api_error") return;
  const message = sanitizeMessage(rawMessage);
  if (!message) return;
  const key = kind + "|" + message;
  if (state.sent.has(key) || state.count >= MAX_REPORTS_PER_PAGE) return;
  state.sent.add(key);
  state.count += 1;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return;
  try {
    fetch(String(url).replace(/\/+$/, "") + "/rest/v1/rpc/log_client_error", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: "Bearer " + anonKey },
      body: JSON.stringify({
        p_kind: kind,
        p_message: message,
        p_path: String(window.location.pathname || "/").slice(0, 120),
        p_agent: uaFamily(window.navigator.userAgent),
      }),
      keepalive: true,
    })
      .then((response) => {
        if (response.status === 404) state.disabled = true; // script SQL absent : on arrête d'insister
      })
      .catch(() => {});
  } catch (e) {
    // le journal ne doit jamais provoquer d'erreur lui-même
  }
}

function logApiProblem(input, init, what) {
  try {
    if (window.navigator.onLine === false) return; // hors ligne : bruit, pas une panne
    const raw = typeof input === "string" ? input : (input && input.url) || String(input);
    const u = new URL(raw, window.location.href);
    if (/\/rest\/v1\/rpc\/log_client_error$/.test(u.pathname)) return;
    if (u.pathname.indexOf("/storage/v1/object/public/") === 0) return; // les médias sont contrôlés par le diagnostic
    const method = (init && init.method) || (input && input.method) || "GET";
    reportClientError("api_error", method + " " + u.pathname + " → " + what);
  } catch (e) {
    // sans importance
  }
}

// À fournir au client Supabase (option global.fetch) : signale les appels qui échouent
// côté serveur (HTTP 5xx) ou côté réseau. Les erreurs 4xx (droits, ligne absente) sont normales.
export async function observedFetch(input, init) {
  try {
    const response = await fetch(input, init);
    if (response.status >= 500) logApiProblem(input, init, "HTTP " + response.status);
    return response;
  } catch (err) {
    if (!err || err.name !== "AbortError") logApiProblem(input, init, "échec réseau");
    throw err;
  }
}

// Écoute les erreurs de la page. Renvoie une fonction qui arrête l'écoute.
export function installErrorLogger() {
  if (typeof window === "undefined") return () => {};
  const onError = (event) => {
    if (shouldIgnoreError({ message: event.message, filename: event.filename })) return;
    reportClientError("js_error", event.message);
  };
  const onRejection = (event) => {
    const reason = event && event.reason;
    const message = reason && reason.message ? reason.message : String(reason);
    if (shouldIgnoreError({ message })) return;
    reportClientError("unhandled_rejection", message);
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}

// Réservé aux tests
export function __resetErrorLogger() {
  state.sent = new Set();
  state.count = 0;
  state.disabled = false;
  state.diagnostic = false;
}
