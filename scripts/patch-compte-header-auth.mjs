#!/usr/bin/env node
// ============================================================
// patch-compte-header-auth.mjs
// ZENORIA_COMPTE_HEADER_AUTH_V1
//
// Corrige l'en-tete de la page Mon compte (pages/compte.js).
//
// Cause : <SiteHeader> etait appele SANS user, isAdmin, authLoading, onLogout, accountMenuOpen...
//  - Mobile : le menu hamburger affichait toujours « Connexion / Creer un compte », meme connectee.
//  - PC : l'icone « compte » n'avait aucune action (onAccountClick absent) ; sur l'accueil elle ouvre
//    le menu « Connecte(e) en tant que ».
//
// Correctif (pages/compte.js uniquement ; SiteHeader.js n'est PAS modifie) :
//  - le menu hamburger affiche « Mon compte » et « Se deconnecter (e-mail) » (+ « Administration » si admin) ;
//    pendant la verification de la session (user === undefined), il n'affiche ni connexion ni deconnexion ;
//  - l'icone compte (PC) ouvre/ferme le menu « Connecte(e) en tant que » ; un clic ailleurs le referme ;
//  - la deconnexion reutilise la fonction logout() de la page : la question « Garder votre panier ? » est inchangee.
//
// Usage : node scripts/patch-compte-header-auth.mjs      Idempotent. Une ancre fausse : arret SANS RIEN ECRIRE.
// ============================================================
import fs from "node:fs";
import path from "node:path";

const MARK = "ZENORIA_COMPTE_HEADER_AUTH_V1";
const FILE = path.join(process.cwd(), "pages", "compte.js");
const fail = (m) => { console.error(`[patch-compte-header-auth] ${m}`); process.exit(1); };

if (!fs.existsSync(FILE)) fail(`fichier introuvable : ${FILE} (lancez le script depuis la racine du projet)`);
const original = fs.readFileSync(FILE, "utf8");
if (original.includes(MARK)) { console.log("[patch-compte-header-auth] deja applique, rien a faire."); process.exit(0); }
const crlf = original.includes("\r\n");
const text = original.replace(/\r\n/g, "\n");

// ---- Edit 1 : etat du menu compte, juste apres l'etat logoutAsk ----
const STATE_RE = /^([ \t]*)const \[logoutAsk, setLogoutAsk\] = useState\(false\);[^\n]*\n/gm;

// ---- Edit 2 : appel de <SiteHeader> (correspondance exacte, multi-lignes) ----
const HEADER_FROM =
  '      <SiteHeader\n' +
  '        logoHref="/"\n' +
  '        showSearch={false}\n' +
  '        showAccount={true}\n' +
  '        onFavClick={() => go("favoris")}\n' +
  '        showCart={true}\n' +
  '        cartCount={headerCartCount}\n' +
  '        onCartClick={() => window.location.assign("/#panier")}\n' +
  '      />\n';
const HEADER_TO =
  '      <SiteHeader\n' +
  '        logoHref="/"\n' +
  '        showSearch={false}\n' +
  '        showAccount={true}\n' +
  '        user={user} // ' + MARK + ' : sans user, le menu mobile affichait « Connexion / Créer un compte » même connectée\n' +
  '        isAdmin={isAdmin}\n' +
  '        authLoading={user === undefined}\n' +
  '        accountMenuOpen={accountMenuOpen}\n' +
  '        onAccountClick={() => setAccountMenuOpen((v) => !v)}\n' +
  '        onAccountMenuClose={() => setAccountMenuOpen(false)}\n' +
  '        onLogout={() => { setAccountMenuOpen(false); logout(); }}\n' +
  '        onFavClick={() => go("favoris")}\n' +
  '        showCart={true}\n' +
  '        cartCount={headerCartCount}\n' +
  '        onCartClick={() => window.location.assign("/#panier")}\n' +
  '      />\n';

const problems = [];
const nState = (text.match(STATE_RE) || []).length;
if (nState !== 1) problems.push(`etat « logoutAsk » trouve ${nState} fois au lieu de 1`);
const nHeader = text.split(HEADER_FROM).length - 1;
if (nHeader !== 1) problems.push(`appel <SiteHeader ...> trouve ${nHeader} fois au lieu de 1`);
if (/accountMenuOpen/.test(text)) problems.push("« accountMenuOpen » existe deja dans le fichier : verification manuelle necessaire");
if (problems.length) fail("au moins une ancre ne correspond pas (fichier modifie depuis, ou texte different de celui verifie). Rien n'a ete ecrit :\n  - " + problems.join("\n  - "));

let out = text.replace(STATE_RE, (m, indent) => m + indent + "const [accountMenuOpen, setAccountMenuOpen] = useState(false); // " + MARK + " : menu « Connecté(e) en tant que » de l'en-tête (PC)\n");
out = out.replace(HEADER_FROM, () => HEADER_TO);

for (const [ok, what] of [
  [out.includes("user={user}"), "prop user"],
  [out.includes("authLoading={user === undefined}"), "prop authLoading"],
  [out.includes("onLogout={() => { setAccountMenuOpen(false); logout(); }}"), "prop onLogout"],
  [(out.match(/const \[accountMenuOpen, setAccountMenuOpen\]/g) || []).length === 1, "etat accountMenuOpen declare une seule fois"],
  [(out.match(/<SiteHeader/g) || []).length === 1, "un seul <SiteHeader>"],
]) if (!ok) fail(`controle final : ${what} absent apres patch. Rien n'a ete ecrit.`);

fs.writeFileSync(FILE, crlf ? out.replace(/\n/g, "\r\n") : out, "utf8");
console.log("[patch-compte-header-auth] pages/compte.js mis a jour : l'en-tete connait maintenant la cliente connectee (menu mobile, icone compte, deconnexion).");
