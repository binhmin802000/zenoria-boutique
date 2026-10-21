// ============================================================
// scripts/patch-compte-bandeau-final.mjs — Espace cliente : bandeau validé « Proposition B · Ivoire champagne »
// ZENORIA_ACCOUNT_HERO_B_V1
//
// Rendu validé le 21/10/2026 :
//  - photo entière (toute sa hauteur), calée à droite ; zone de la bague INTACTE (aucun filtre, aucun voile) ;
//  - fondu progressif depuis le bord gauche de la bague vers la gauche (masque sur l'image) ;
//  - fond « ivoire champagne » en dégradé fin + halo chaud derrière le texte ;
//  - voile clair limité à la zone du texte (lisibilité de « Bonjour » et de l'e-mail) ;
//  - fin filet doré sous « Bonjour » ;
//  - mobile : bague décalée à droite, texte à gauche, e-mail raccourci si besoin.
// Remplace le bloc du bandeau de pages/compte.js, quelle que soit la version précédente
// (étape 1.2, correctif « dézoom » ou version « chic »).
// Usage (dossier zenoria, branche espace-client) :
//   node scripts\patch-compte-bandeau-final.mjs --dry-run
//   node scripts\patch-compte-bandeau-final.mjs
// ============================================================
import fs from "node:fs";
import { execSync } from "node:child_process";

const MARK = "ZENORIA_ACCOUNT_HERO_B_V1";
const REL = "pages/compte.js";
const DRY = process.argv.includes("--dry-run");
const fail = (m) => { console.error(`\n\u2717 ARRÊT : ${m}\nAucun fichier n'a été modifié.\n`); process.exit(1); };

console.log(`\nBandeau Mon compte : version finale B (ivoire champagne)${DRY ? " — VÉRIFICATION SEULE" : ""}\n`);
const branch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8" }).trim();
if (branch !== "espace-client") fail(`branche actuelle « ${branch} » : passez sur espace-client`);
console.log("  \u2713 branche espace-client");
if (!fs.existsSync(REL)) fail(`${REL} introuvable`);
const raw = fs.readFileSync(REL, "utf8");
const bom = raw.charCodeAt(0) === 0xfeff;
const eol = raw.includes("\r\n") ? "\r\n" : "\n";
let t = (bom ? raw.slice(1) : raw).replace(/\r\n/g, "\n");
if (t.includes(MARK)) { console.log("  \u00b7 déjà appliqué, rien à faire.\n"); process.exit(0); }
if (!t.includes("ZENORIA_ACCOUNT_STEP12_V1")) fail("l'étape 1.2 n'est pas appliquée sur pages/compte.js");
if (!t.includes("const [heroUrl, setHeroUrl]") || !t.includes("DEFAULT_HERO")) fail("variables heroUrl / DEFAULT_HERO introuvables dans pages/compte.js");

const START = "          {/* BANDEAU D'ACCUEIL";
const END = "          <div className=\"grid lg:grid-cols-[230px_1fr] gap-6\">";
const start = t.indexOf(START);
const end = t.indexOf(END);
if (start < 0 || end < 0 || end < start) fail("bloc du bandeau introuvable dans pages/compte.js");
if (t.indexOf(START, start + 1) >= 0) fail("plusieurs blocs « BANDEAU D'ACCUEIL » trouvés : vérifiez à la main");
console.log("  \u2713 bloc du bandeau trouvé");

const NEW = `          {/* BANDEAU D'ACCUEIL (${MARK}) — rendu validé « Proposition B · Ivoire champagne ».
              Photo entière calée à droite ; zone du bijou intacte ; fondu progressif vers la gauche ;
              fond champagne + halo chaud ; voile limité à la zone du texte.
              Image modifiable dans Admin › Contenu du site (emplacement account_hero) :
              cadrer le bijou dans la moitié droite de l'image pour conserver cet effet. */}
          <section
            data-testid="account-hero"
            className="relative rounded-[1.5rem] overflow-hidden h-[220px] sm:h-[240px] flex items-center mb-6 border border-[#efe2d6]"
            style={{
              background: [
                "radial-gradient(ellipse 34% 75% at 17% 45%, rgba(255,244,232,.85) 0%, rgba(255,244,232,0) 100%)",
                "linear-gradient(100deg, #fcf7f0 0%, #f9f0e5 35%, #f6eae0 60%, #f4e7de 100%)",
              ].join(","),
            }}
          >
            {/* Photo : toute la hauteur, calée à droite (décalée sur mobile) ;
                masque : transparent au bord gauche, opaque avant la zone du bijou (environ 42 % de la largeur de l'image) */}
            <img
              src={heroUrl}
              alt=""
              aria-hidden="true"
              draggable="false"
              onError={() => setHeroUrl(DEFAULT_HERO)}
              className="absolute inset-y-0 right-[-26%] sm:right-0 h-full w-auto max-w-none select-none pointer-events-none"
              style={{
                WebkitMaskImage: "linear-gradient(to right, transparent 0%, rgba(0,0,0,.12) 10%, rgba(0,0,0,.4) 20%, rgba(0,0,0,.75) 31%, #000 42%)",
                maskImage: "linear-gradient(to right, transparent 0%, rgba(0,0,0,.12) 10%, rgba(0,0,0,.4) 20%, rgba(0,0,0,.75) 31%, #000 42%)",
              }}
            />
            {/* Voile champagne limité à la zone du texte (ne touche pas le bijou) */}
            <div
              aria-hidden="true"
              className="absolute inset-0 hidden sm:block"
              style={{ background: "linear-gradient(90deg, rgba(252,247,240,.6) 0%, rgba(250,243,234,.5) 22%, rgba(249,240,229,.18) 38%, rgba(249,240,229,0) 48%)" }}
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 sm:hidden"
              style={{ background: "linear-gradient(90deg, rgba(252,247,240,.75) 0%, rgba(250,243,234,.55) 34%, rgba(249,240,229,.15) 50%, rgba(249,240,229,0) 58%)" }}
            />

            <div className="relative pl-5 pr-3 sm:px-14 max-w-[56%] sm:max-w-md">
              <p className="text-[10px] sm:text-[11px] uppercase tracking-[.28em] text-[#b48a5a]">Mon compte</p>
              <h1 className="font-serif text-3xl sm:text-5xl text-[#4a3743] mt-1.5 leading-tight">Bonjour</h1>
              <span aria-hidden="true" className="block h-px w-12 sm:w-14 mt-2.5 mb-2" style={{ background: "linear-gradient(90deg, #c9a679, rgba(201,166,121,0))" }} />
              <p className="text-[11px] sm:text-sm text-[#705e68] truncate" title={user.email}>{user.email}</p>
            </div>
          </section>

`;
t = t.slice(0, start) + NEW + t.slice(end);
if (DRY) { console.log("\nVérification réussie : 1 fichier serait écrit. Rien n'a été modifié.\n"); process.exit(0); }
fs.writeFileSync(REL, (bom ? "\uFEFF" : "") + (eol === "\r\n" ? t.replace(/\n/g, "\r\n") : t), "utf8");
console.log(`  \u2713 ${REL} modifié\n\nTerminé. Rechargez /compte avec Ctrl+F5, puis npm run build avant le commit.\n`);
