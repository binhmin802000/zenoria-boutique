// ZENORIA_INSTALL_BANNER_V1
// ============================================================
// Magasin d'etat UNIQUE pour l'installation de l'application, partage par tous les composants qui
// l'utilisent (bouton du header, bandeau). Sans ce partage, deux appels independants du hook React
// (un par composant) garderaient chacun leur propre copie de l'etat : installer via le bandeau ne
// mettrait alors pas forcement a jour le bouton (et inversement), exactement le defaut a eviter.
//
// Les ecouteurs du navigateur ("beforeinstallprompt", "appinstalled") ne sont poses QU'UNE SEULE
// FOIS (quel que soit le nombre de composants montes), gardes par le drapeau "initialized".
// Vanille JS (aucun React ici) : testable par lib/useInstallPrompt depuis Chromium ; la logique
// de decision (shouldShowButton, shouldShowBanner...) reste dans lib/installPrompt.js, deja testee
// en pur Node.
// ============================================================
import { BANNER_DISMISSED_KEY, BANNER_DELAY_MS, detectIos, isStandaloneDisplay, parseDismissed } from "./installPrompt";

let state = { deferredPrompt: null, installed: false, isIos: false, standalone: false, dismissed: false, delayElapsed: false };
let listeners = new Set();
let initialized = false;
let delayTimer = null;

function notify() {
  listeners.forEach((fn) => fn(state));
}

function patch(next) {
  state = { ...state, ...next };
  notify();
}

export function getInstallState() {
  return state;
}

export function subscribeInstallState(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readDismissed() {
  try {
    return parseDismissed(window.localStorage.getItem(BANNER_DISMISSED_KEY));
  } catch (e) {
    return false;
  }
}

function writeDismissed() {
  try {
    window.localStorage.setItem(BANNER_DISMISSED_KEY, "1");
  } catch (e) {
    // stockage indisponible (navigation privee...) : la fermeture reste valable pour la visite en cours
  }
}

// À appeler depuis un effet React (donc uniquement côté navigateur) ; sans effet au-delà du
// premier appel, quel que soit le nombre de composants qui le déclenchent.
export function initInstallPrompt() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  let standaloneMatches = false;
  try {
    standaloneMatches = window.matchMedia("(display-mode: standalone)").matches;
  } catch (e) {
    standaloneMatches = false;
  }

  patch({
    isIos: detectIos(window.navigator.userAgent, window.navigator.platform, window.navigator.maxTouchPoints),
    standalone: isStandaloneDisplay(window.navigator.standalone, standaloneMatches),
    dismissed: readDismissed(),
  });

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // empêche la mini-infobar automatique de Chrome : notre bouton/bandeau la remplace
    patch({ deferredPrompt: e });
  });
  window.addEventListener("appinstalled", () => {
    patch({ deferredPrompt: null, installed: true });
  });

  delayTimer = window.setTimeout(() => patch({ delayElapsed: true }), BANNER_DELAY_MS);
}

export async function promptInstall() {
  const { deferredPrompt } = state;
  if (!deferredPrompt) return;
  try {
    deferredPrompt.prompt();
    await deferredPrompt.userChoice; // résout que la cliente accepte ou refuse : l'invite est consommée dans les deux cas
  } catch (e) {
    // échec silencieux : l'absence d'installation ne doit jamais perturber la navigation
  }
  patch({ deferredPrompt: null }); // un événement "beforeinstallprompt" ne peut être utilisé qu'une seule fois
}

export function dismissBanner() {
  writeDismissed();
  patch({ dismissed: true });
}

// Reservé aux tests : remet le magasin à zéro entre deux scénarios.
export function __resetInstallPromptForTests() {
  state = { deferredPrompt: null, installed: false, isIos: false, standalone: false, dismissed: false, delayElapsed: false };
  listeners = new Set();
  initialized = false;
  if (delayTimer) {
    clearTimeout(delayTimer);
    delayTimer = null;
  }
}
