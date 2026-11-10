#!/usr/bin/env node
// ============================================================
// patch-compte-hero-flush.mjs
// ZENORIA_COMPTE_HERO_FLUSH_V1
//
// PREREQUIS : patch-compte-season-fx.mjs ET patch-compte-layout-fx-overlay.mjs deja appliques.
//
// Supprime les ecarts verticaux de la page Mon compte et fait descendre le bandeau photo jusqu'aux
// onglets / aux cartes, sur mobile ET sur ordinateur.
//
//  - Bandeau : +24 px de hauteur (220 -> 244 mobile, 240 -> 264 PC), sans marge basse, coins du bas droits.
//    Le bas de la photo reste le bas du bandeau : le filigrane "(c) 2026 ZENORIA" n'est ni recouvert ni deplace.
//  - Mobile : bandeau + barre d'onglets + carte de contenu forment UN SEUL bloc (plus d'ecart "1" ni "2").
//  - PC : le bandeau touche le menu vertical et la carte ; le menu vertical (Mes commandes, Mes favoris...)
//    garde son apparence et sa position a gauche.
//  - Animation saisonniere : desormais DANS le bandeau (derriere le texte, au-dessus de la photo),
//    plus de zone separee. Meme reglage admin (season_fx).
//  - Les couleurs et degrades existants ne changent pas.
//
// Usage : node scripts/patch-compte-hero-flush.mjs
// Idempotent. Si UNE ancre ne correspond pas EXACTEMENT : arret SANS RIEN ECRIRE.
// ============================================================
import fs from "node:fs";
import path from "node:path";

const MARK = "ZENORIA_COMPTE_HERO_FLUSH_V1";
const PREREQS = ["ZENORIA_COMPTE_SEASON_FX_V1", "ZENORIA_COMPTE_LAYOUT_FIX_V1"];
const FILE = path.join(process.cwd(), "pages", "compte.js");

function fail(message) {
  console.error(`[patch-compte-hero-flush] ${message}`);
  process.exit(1);
}

if (!fs.existsSync(FILE)) fail(`fichier introuvable : ${FILE} (lancez le script depuis la racine du projet)`);

const original = fs.readFileSync(FILE, "utf8");
if (original.includes(MARK)) {
  console.log("[patch-compte-hero-flush] déjà appliqué, rien à faire.");
  process.exit(0);
}
for (const p of PREREQS) {
  if (!original.includes(p)) fail("prérequis manquant : marqueur " + p + " absent. Appliquez d'abord les deux patchs précédents. Rien n'a été écrit.");
}

const usesCRLF = original.includes("\r\n");
const content = original.replace(/\r\n/g, "\n");

// Ancre tolerante aux retours a la ligne / indentations (les affichages PowerShell coupent les lignes longues)
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const toRegex = (s) => new RegExp(escapeRegex(s).replace(/\s+/g, "\\s+"), "g");

const EDITS = [
  // 1. Retrait du conteneur ajoute par le patch precedent
  {
    label: "retrait du conteneur commun (patch precedent)",
    from:
      '          {/* ZENORIA_COMPTE_LAYOUT_FIX_V1 : conteneur commun bandeau + zone du dessous, recouvert par l\'animation */}\n' +
      '          <div className="relative">\n' +
      '          <section\n',
    to: '          <section\n',
  },
  // 2. Bandeau : plus haut de 24 px, sans marge basse, coins du bas droits
  {
    label: "bandeau : hauteur, marge basse, coins",
    tolerant: true,
    from: 'relative rounded-[1.5rem] overflow-hidden h-[220px] sm:h-[240px] flex items-center mb-6 border border-[#efe2d6]',
    to: 'relative rounded-t-[1.5rem] overflow-hidden h-[244px] sm:h-[264px] flex items-center mb-0 border border-[#efe2d6]',
  },
  // 3. Animation DANS le bandeau, derriere le texte
  {
    label: "animation dans le bandeau",
    from: '            <div className="relative pl-5 pr-3 sm:px-14 max-w-[56%] sm:max-w-md">\n',
    to:
      '            {/* ' + MARK + ' : animation saisonniere sur le bandeau (au-dessus de la photo, derriere le texte) ; meme reglage admin que l\'accueil */}\n' +
      '            {nowMs !== null && (() => {\n' +
      '              const fxSeason = pickFxSeason(fxSetting, resolveFxSeason(fxSetting, null, new Date(nowMs)));\n' +
      '              return fxSeason ? (\n' +
      '                <div aria-hidden="true" className="absolute inset-0 pointer-events-none">\n' +
      '                  <SeasonFx season={fxSeason} />\n' +
      '                </div>\n' +
      '              ) : null;\n' +
      '            })()}\n' +
      '\n' +
      '            <div className="relative pl-5 pr-3 sm:px-14 max-w-[56%] sm:max-w-md">\n',
  },
  // 4. Retrait de l'ancien bloc d'animation (zone separee + espaceur)
  {
    label: "retrait de l'ancien bloc d'animation et de l'espaceur",
    from:
      '\n' +
      '          {/* ZENORIA_COMPTE_SEASON_FX_V1 : meme reglage admin que l\'accueil (Contenu du site > Vitrine & ambiance) */}\n' +
      '          {nowMs !== null && (() => {\n' +
      '            const fxSeason = pickFxSeason(fxSetting, resolveFxSeason(fxSetting, null, new Date(nowMs)));\n' +
      '            return fxSeason ? (\n' +
      '              <>\n' +
      '                {/* ZENORIA_COMPTE_LAYOUT_FIX_V1 : zone de respiration sous le bandeau, recouverte elle aussi par l\'animation */}\n' +
      '                <div aria-hidden="true" className="h-10 sm:h-12" />\n' +
      '                <div aria-hidden="true" className="absolute inset-0 overflow-hidden rounded-[1.5rem] pointer-events-none">\n' +
      '                  <SeasonFx season={fxSeason} />\n' +
      '                </div>\n' +
      '              </>\n' +
      '            ) : null;\n' +
      '          })()}\n' +
      '          </div>\n',
    to: '',
  },
  // 5. Grille : aucun ecart sur mobile (24 px conserves sur PC), recouvre d'1 px la bordure du bandeau
  {
    label: "grille : gap-0 sur mobile",
    tolerant: true,
    from: 'className="grid grid-cols-1 lg:grid-cols-[230px_1fr] gap-6"',
    to: 'className="grid grid-cols-1 lg:grid-cols-[230px_1fr] gap-0 lg:gap-6 -mt-px"',
  },
  // 6. Barre d'onglets : plat sur mobile (suite du bandeau), carte a coins bas arrondis sur PC
  {
    label: "barre d'onglets : prolongement du bandeau",
    tolerant: true,
    from: 'overflow-x-auto lg:overflow-visible rounded-full lg:rounded-2xl bg-white border border-[#eadfe4] p-1.5 lg:p-2.5',
    to: 'overflow-x-auto lg:overflow-visible rounded-none lg:rounded-b-2xl bg-white border border-[#eadfe4] p-1.5 lg:p-2.5',
  },
  // 7. Carte de contenu : collee a la barre d'onglets (mobile) et au bandeau (PC)
  {
    label: "carte de contenu : collee au bloc du dessus",
    tolerant: true,
    from: 'className="rounded-2xl bg-white border border-[#eadfe4] p-6 min-h-[260px]"',
    to: 'className="rounded-t-none rounded-b-2xl bg-white border border-[#eadfe4] p-6 min-h-[260px] -mt-px lg:mt-0"',
  },
];

const problems = [];
const compiled = EDITS.map((e) => {
  // Multi-lignes : correspondance exacte (preserve la mise en forme). Une ligne : tolere une cesure d'affichage.
  const re = e.tolerant ? toRegex(e.from) : new RegExp(escapeRegex(e.from), "g");
  const count = (content.match(re) || []).length;
  if (count !== 1) problems.push(`« ${e.label} » trouvée ${count} fois au lieu de 1`);
  return { ...e, re };
});
if (problems.length > 0) {
  fail(
    "au moins une ancre ne correspond pas. Fichier modifié depuis, ou texte différent de ce qui a été vérifié. " +
    "Rien n'a été écrit. Détail :\n  - " + problems.join("\n  - ")
  );
}

let updated = content;
for (const e of compiled) updated = updated.replace(e.re, () => e.to);

// Controles finaux
const must = ['h-[244px] sm:h-[264px]', 'mb-0 border border-[#efe2d6]', 'gap-0 lg:gap-6 -mt-px', 'rounded-none lg:rounded-b-2xl', 'rounded-t-none rounded-b-2xl'];
for (const m of must) if (!updated.includes(m)) fail("contrôle final : « " + m + " » absent après patch. Rien n'a été écrit.");
const forbidden = ['h-10 sm:h-12', '<div className="relative">\n          <section'];
for (const f of forbidden) if (updated.includes(f)) fail("contrôle final : « " + f + " » toujours présent. Rien n'a été écrit.");
if ((updated.match(/<SeasonFx season=\{fxSeason\} \/>/g) || []).length !== 1) fail("contrôle final : <SeasonFx> doit apparaître exactement 1 fois.");
if ((updated.match(/\(\) => \{\n\s*const fxSeason/g) || []).length !== 1) fail("contrôle final : le calcul fxSeason doit apparaître exactement 1 fois.");
if (!updated.includes(MARK)) fail("contrôle final : marqueur absent.");

fs.writeFileSync(FILE, usesCRLF ? updated.replace(/\n/g, "\r\n") : updated, "utf8");

console.log("[patch-compte-hero-flush] pages/compte.js mis à jour :");
console.log("[patch-compte-hero-flush]   - bandeau agrandi de 24 px, collé aux onglets (mobile) et aux cartes (PC)");
console.log("[patch-compte-hero-flush]   - mobile : bandeau + onglets + carte = un seul bloc, sans écart");
console.log("[patch-compte-hero-flush]   - animation saisonnière dans le bandeau uniquement");
