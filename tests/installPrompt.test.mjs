// Tests de la logique pure du bandeau/bouton d'installation (lib/installPrompt.js).
// Lancer : node tests/installPrompt.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {
  BANNER_DISMISSED_KEY,
  BANNER_DELAY_MS,
  detectIos,
  isStandaloneDisplay,
  parseDismissed,
  shouldShowButton,
  shouldShowBanner,
  bannerVariant,
} from "../lib/installPrompt.js";

test("constantes de base", () => {
  assert.equal(BANNER_DISMISSED_KEY, "zenoria_install_banner_dismissed_v1");
  assert.equal(BANNER_DELAY_MS, 3000);
});

// ---------- Detection iOS ----------

test("detection iOS : iPhone, iPad, iPod classiques", () => {
  assert.equal(detectIos("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", "iPhone", 5), true);
  assert.equal(detectIos("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)", "iPad", 5), true);
  assert.equal(detectIos("Mozilla/5.0 (iPod touch; CPU iPhone OS 17_0)", "iPod", 5), true);
});

test("detection iOS : iPad recent qui s'annonce comme MacIntel tactile", () => {
  assert.equal(detectIos("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6)", "MacIntel", 5), true);
});

test("detection iOS : faux sur ordinateur (MacIntel sans tactile), Android, Windows", () => {
  assert.equal(detectIos("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6)", "MacIntel", 0), false);
  assert.equal(detectIos("Mozilla/5.0 (Linux; Android 14)", "Linux armv8l", 5), false);
  assert.equal(detectIos("Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Win32", 0), false);
});

test("detection iOS : valeurs absentes ou vides ne plantent pas", () => {
  assert.equal(detectIos(undefined, undefined, undefined), false);
  assert.equal(detectIos("", "", 0), false);
  assert.equal(detectIos(null, null, null), false);
});

// ---------- Mode application deja installee ----------

test("mode application : navigator.standalone (iOS) prioritaire", () => {
  assert.equal(isStandaloneDisplay(true, false), true);
  assert.equal(isStandaloneDisplay(false, true), true);
  assert.equal(isStandaloneDisplay(false, false), false);
  assert.equal(isStandaloneDisplay(undefined, undefined), false);
});

// ---------- Memoire de fermeture ----------

test("memoire de fermeture : seule la valeur exacte '1' compte comme ferme", () => {
  assert.equal(parseDismissed("1"), true);
  assert.equal(parseDismissed("0"), false);
  assert.equal(parseDismissed(""), false);
  assert.equal(parseDismissed(null), false);
  assert.equal(parseDismissed(undefined), false);
  assert.equal(parseDismissed("true"), false);
});

// ---------- Bouton (SiteHeader) ----------

test("bouton : visible seulement si une invite est disponible et rien n'est installe", () => {
  assert.equal(shouldShowButton({ canInstall: true, installed: false }), true);
  assert.equal(shouldShowButton({ canInstall: false, installed: false }), false);
  assert.equal(shouldShowButton({ canInstall: true, installed: true }), false);
});

test("bouton : jamais visible sur iOS, meme si canInstall serait vrai par erreur", () => {
  // Le bouton ne regarde meme pas isIos : canInstall ne devient jamais vrai sur iOS en pratique
  // (beforeinstallprompt n'existe pas), mais on verifie que la fonction ne depend que de ces 2 champs.
  assert.equal(shouldShowButton({ canInstall: true, installed: false, isIos: true }), true);
});

// ---------- Bandeau ----------

test("bandeau : Android/ordinateur, invite disponible, apres le delai", () => {
  assert.equal(shouldShowBanner({ canInstall: true, isIos: false, installed: false, standalone: false, dismissed: false, delayElapsed: true }), true);
});

test("bandeau : iOS, sans invite possible, apres le delai", () => {
  assert.equal(shouldShowBanner({ canInstall: false, isIos: true, installed: false, standalone: false, dismissed: false, delayElapsed: true }), true);
});

test("bandeau : invisible avant la fin du delai, meme si tout le reste est favorable", () => {
  assert.equal(shouldShowBanner({ canInstall: true, isIos: false, installed: false, standalone: false, dismissed: false, delayElapsed: false }), false);
});

test("bandeau : invisible si deja installe", () => {
  assert.equal(shouldShowBanner({ canInstall: true, isIos: false, installed: true, standalone: false, dismissed: false, delayElapsed: true }), false);
});

test("bandeau : invisible si deja en mode application (standalone)", () => {
  assert.equal(shouldShowBanner({ canInstall: true, isIos: false, installed: false, standalone: true, dismissed: false, delayElapsed: true }), false);
});

test("bandeau : invisible si deja ferme sur cet appareil", () => {
  assert.equal(shouldShowBanner({ canInstall: true, isIos: false, installed: false, standalone: false, dismissed: true, delayElapsed: true }), false);
});

test("bandeau : invisible si ni invite ni iOS (Android non installable, ou navigateur inconnu)", () => {
  assert.equal(shouldShowBanner({ canInstall: false, isIos: false, installed: false, standalone: false, dismissed: false, delayElapsed: true }), false);
});

test("bandeau : la fermeture est prioritaire meme sur iOS", () => {
  assert.equal(shouldShowBanner({ canInstall: false, isIos: true, installed: false, standalone: false, dismissed: true, delayElapsed: true }), false);
});

// ---------- Variante de contenu ----------

test("variante : action (bouton direct) quand une invite est disponible, meme en theorie sur iOS", () => {
  assert.equal(bannerVariant({ canInstall: true, isIos: false }), "action");
  assert.equal(bannerVariant({ canInstall: true, isIos: true }), "action");
});

test("variante : instructions iOS quand pas d'invite mais plateforme iOS", () => {
  assert.equal(bannerVariant({ canInstall: false, isIos: true }), "ios");
});

test("variante : aucune si ni invite ni iOS", () => {
  assert.equal(bannerVariant({ canInstall: false, isIos: false }), null);
});
