#!/usr/bin/env node
// ============================================================
// patch-compte-layout-fx-overlay.mjs
// ZENORIA_COMPTE_LAYOUT_FIX_V1
//
// PREREQUIS : patch-compte-season-fx.mjs deja applique (marqueur ZENORIA_COMPTE_SEASON_FX_V1).
//
// Deux corrections dans pages/compte.js (mobile) :
//
// 1. CAUSE RACINE du decalage constate sur mobile (header/panier au milieu, image "au milieu",
//    grand vide a droite) : la grille <div className="grid lg:grid-cols-[230px_1fr]"> n'a pas de
//    colonne definie sur mobile. Sa colonne implicite est "auto" et ne peut pas etre plus etroite
//    que son contenu : la barre d'onglets (6 boutons en whitespace-nowrap, ~673 px) elargit toute la
//    page (reproduit a 412 px : page 691 px au lieu de 412, barre qui ne defile pas). Le navigateur
//    mobile dezoome alors pour tout afficher.
//    Correctif : "grid-cols-1" (= repeat(1, minmax(0, 1fr))) sur mobile. La barre d'onglets defile
//    dans son cadre (overflow-x-auto, deja present). Desktop (lg:) inchange : meme "230px 1fr".
//
// 2. Animation saisonniere : au lieu d'une bande separee sous le bandeau, le canvas recouvre
//    le bandeau (photo comprise) ET la zone de respiration qui le suit. Aucun clic intercepte
//    (pointer-events-none), couleurs et degrades existants inchanges.
//
// Usage : node scripts/patch-compte-layout-fx-overlay.mjs
// Idempotent. Si UNE ancre ne correspond pas EXACTEMENT : arret SANS RIEN ECRIRE.
// ============================================================
import fs from "node:fs";
import path from "node:path";

const MARK = "ZENORIA_COMPTE_LAYOUT_FIX_V1";
const PREREQ = "ZENORIA_COMPTE_SEASON_FX_V1";
const FILE = path.join(process.cwd(), "pages", "compte.js");

function fail(message) {
  console.error(`[patch-compte-layout-fx-overlay] ${message}`);
  process.exit(1);
}

if (!fs.existsSync(FILE)) fail(`fichier introuvable : ${FILE} (lancez le script depuis la racine du projet)`);

const original = fs.readFileSync(FILE, "utf8");
if (original.includes(MARK)) {
  console.log("[patch-compte-layout-fx-overlay] déjà appliqué, rien à faire.");
  process.exit(0);
}
if (!original.includes(PREREQ)) {
  fail("prérequis manquant : appliquez d'abord patch-compte-season-fx.mjs (marqueur " + PREREQ + " absent). Rien n'a été écrit.");
}

const usesCRLF = original.includes("\r\n");
const content = original.replace(/\r\n/g, "\n");

// ---------- Édit 1 : grille mobile ----------
const EDIT_GRID = {
  label: "grille : grid-cols-1 sur mobile",
  from:
    '          <div className="grid lg:grid-cols-[230px_1fr] gap-6">\n' +
    '            {/* MENU : à gauche sur ordinateur, onglets défilants sur mobile */}\n',
  to:
    '          <div className="grid grid-cols-1 lg:grid-cols-[230px_1fr] gap-6">\n' +
    '            {/* MENU : à gauche sur ordinateur, onglets défilants sur mobile. ' + MARK + ' : grid-cols-1 empeche la barre d\'onglets d\'elargir la page sur mobile */}\n',
};

// ---------- Édit 2 : conteneur relatif autour du bandeau ----------
const EDIT_OPEN = {
  label: "ouverture du conteneur du bandeau",
  from:
    '          <section\n' +
    '            data-testid="account-hero"\n',
  to:
    '          {/* ' + MARK + ' : conteneur commun bandeau + zone du dessous, recouvert par l\'animation */}\n' +
    '          <div className="relative">\n' +
    '          <section\n' +
    '            data-testid="account-hero"\n',
};

// ---------- Édit 3 : bande séparée -> recouvrement + fermeture du conteneur ----------
const EDIT_FX = {
  label: "animation : recouvrement du bandeau et de la zone du dessous",
  from:
    '          {/* ZENORIA_COMPTE_SEASON_FX_V1 : meme reglage admin que l\'accueil (Contenu du site > Vitrine & ambiance) */}\n' +
    '          {nowMs !== null && (() => {\n' +
    '            const fxSeason = pickFxSeason(fxSetting, resolveFxSeason(fxSetting, null, new Date(nowMs)));\n' +
    '            return fxSeason ? (\n' +
    '              <div aria-hidden="true" className="relative h-14 sm:h-16 overflow-hidden rounded-xl mb-6">\n' +
    '                <SeasonFx season={fxSeason} />\n' +
    '              </div>\n' +
    '            ) : null;\n' +
    '          })()}\n',
  to:
    '          {/* ZENORIA_COMPTE_SEASON_FX_V1 : meme reglage admin que l\'accueil (Contenu du site > Vitrine & ambiance) */}\n' +
    '          {nowMs !== null && (() => {\n' +
    '            const fxSeason = pickFxSeason(fxSetting, resolveFxSeason(fxSetting, null, new Date(nowMs)));\n' +
    '            return fxSeason ? (\n' +
    '              <>\n' +
    '                {/* ' + MARK + ' : zone de respiration sous le bandeau, recouverte elle aussi par l\'animation */}\n' +
    '                <div aria-hidden="true" className="h-10 sm:h-12" />\n' +
    '                <div aria-hidden="true" className="absolute inset-0 overflow-hidden rounded-[1.5rem] pointer-events-none">\n' +
    '                  <SeasonFx season={fxSeason} />\n' +
    '                </div>\n' +
    '              </>\n' +
    '            ) : null;\n' +
    '          })()}\n' +
    '          </div>\n',
};

const EDITS = [EDIT_GRID, EDIT_OPEN, EDIT_FX];

const problems = [];
for (const e of EDITS) {
  const count = content.split(e.from).length - 1;
  if (count !== 1) problems.push(`« ${e.label} » trouvée ${count} fois au lieu de 1`);
}
if (problems.length > 0) {
  fail(
    "au moins une ancre ne correspond pas. Fichier modifié depuis, ou texte différent de ce qui a été vérifié. " +
    "Rien n'a été écrit. Détail :\n  - " + problems.join("\n  - ")
  );
}

let updated = content;
for (const e of EDITS) updated = updated.replace(e.from, () => e.to);

// Contrôles finaux : une seule ouverture ET une seule fermeture ajoutées, grille mobile en place
if ((updated.match(new RegExp(MARK, "g")) || []).length !== 3) fail("contrôle final : le marqueur devrait apparaître 3 fois.");
if (!updated.includes('className="grid grid-cols-1 lg:grid-cols-[230px_1fr] gap-6"')) fail("contrôle final : grille mobile absente.");
if (updated.includes('className="grid lg:grid-cols-[230px_1fr] gap-6"')) fail("contrôle final : ancienne grille toujours présente.");
const opens = (updated.match(/<div className="relative">\n          <section\n            data-testid="account-hero"/g) || []).length;
if (opens !== 1) fail("contrôle final : conteneur d'ouverture attendu 1 fois, trouvé " + opens + ".");

fs.writeFileSync(FILE, usesCRLF ? updated.replace(/\n/g, "\r\n") : updated, "utf8");

console.log("[patch-compte-layout-fx-overlay] pages/compte.js mis à jour :");
console.log("[patch-compte-layout-fx-overlay]   - grille mobile corrigée (la barre d'onglets défile dans son cadre, plus de page élargie)");
console.log("[patch-compte-layout-fx-overlay]   - animation saisonnière sur le bandeau et la zone du dessous");
