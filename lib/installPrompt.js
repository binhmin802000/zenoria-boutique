// ZENORIA_INSTALL_BANNER_V1
// ============================================================
// Logique pure (aucun React, aucun DOM) du bandeau et du bouton d'installation de l'application.
// Testée par tests/installPrompt.test.mjs. Le branchement reel (evenements navigateur, etat React)
// est dans lib/useInstallPrompt.js.
//
// Deux chemins, parce que les plateformes ne se comportent pas pareil :
//  - Android / Chrome / Edge (ordinateur) : le navigateur envoie "beforeinstallprompt" quand il juge
//    le site installable. C'est le SEUL signal fiable ; sans lui, ni le bouton ni le bandeau ne
//    doivent rien proposer (pas de fausse promesse d'installation).
//  - iPhone (Safari) : cet evenement n'existe pas du tout (choix d'Apple). Le bandeau peut seulement
//    EXPLIQUER le geste manuel (Partager > Sur l'ecran d'accueil), jamais le declencher lui-meme.
//
// Memoire de fermeture : un seul reglage, par appareil (localStorage), commun aux deux chemins.
// Une fois fermee (ou l'app installee), la banniere ne doit plus jamais revenir sur cet appareil.
// ============================================================
export const BANNER_DISMISSED_KEY = "zenoria_install_banner_dismissed_v1";
export const BANNER_DELAY_MS = 3000;

// Appareil iPhone/iPad (Safari ou navigateur base sur WebKit iOS) : seule plateforme sans
// "beforeinstallprompt". Les iPad recents s'annoncent parfois comme "MacIntel" avec un ecran
// tactile : on les detecte aussi via maxTouchPoints, comme c'est l'usage courant.
export function detectIos(userAgent, platform, maxTouchPoints) {
  const ua = String(userAgent || "");
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  if (String(platform || "") === "MacIntel" && Number(maxTouchPoints) > 1) return true;
  return false;
}

// Le site tourne-t-il deja en mode application installee (peu importe la plateforme) ?
export function isStandaloneDisplay(navigatorStandalone, matchesStandaloneMediaQuery) {
  if (navigatorStandalone === true) return true;
  return Boolean(matchesStandaloneMediaQuery);
}

export function parseDismissed(raw) {
  return raw === "1";
}

// Le bouton (SiteHeader, menu) suit une regle simple et independante du bandeau : il n'apparait
// que si une vraie invite d'installation est disponible, jamais sur iOS (la plateforme ne permet
// pas de la declencher par un clic), jamais si deja installe.
export function shouldShowButton({ canInstall, installed }) {
  return Boolean(canInstall) && !installed;
}

// Le bandeau peut apparaitre pour deux raisons : une vraie invite disponible (Android/ordinateur),
// ou la plateforme iOS (ou l'explication est utile meme sans invite declenchable). Jamais si deja
// installe, deja ferme sur cet appareil, ou si le site tourne deja en mode application.
export function shouldShowBanner({ canInstall, isIos, installed, standalone, dismissed, delayElapsed }) {
  if (installed || standalone || dismissed || !delayElapsed) return false;
  return Boolean(canInstall) || Boolean(isIos);
}

// Contenu a afficher dans le bandeau : variante "action" (bouton direct) ou "instructions" (iOS).
export function bannerVariant({ canInstall, isIos }) {
  if (canInstall) return "action";
  if (isIos) return "ios";
  return null;
}
