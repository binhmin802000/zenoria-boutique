// ============================================================
// scripts/patch-compte-bandeau-chic.mjs — Espace cliente : bandeau « chic et chaleureux »
// ZENORIA_ACCOUNT_HERO_CHIC_V1
//
// Objectif : réduire le contraste entre la zone texte (gauche) et la photo (droite).
//  - fond du bandeau : dégradé fin ivoire -> poudré rosé -> champagne, aux couleurs du site ;
//  - halo chaud (lumière dorée) derrière le texte, halo rosé à la jonction avec la photo ;
//  - photo légèrement adoucie (contraste et saturation réduits, touche chaude) ;
//  - fondu de la photo plus long et progressif, prolongé par un voile poudré ;
//  - fin filet doré sous « Bonjour ».
// Remplace le bloc du bandeau de pages/compte.js (étape 1.2 + correctif « dézoom »).
// Usage (dossier zenoria, branche espace-client) :
//   node scripts\patch-compte-bandeau-chic.mjs --dry-run
//   node scripts\patch-compte-bandeau-chic.mjs
// ============================================================
import fs from "node:fs";
import { execSync } from "node:child_process";

const MARK = "ZENORIA_ACCOUNT_HERO_CHIC_V1";
const REL = "pages/compte.js";
const DRY = process.argv.includes("--dry-run");
const fail = (m) => { console.error(`\n\u2717 ARRÊT : ${m}\nAucun fichier n'a été modifié.\n`); process.exit(1); };

console.log(`\nBandeau Mon compte : version chic et chaleureuse${DRY ? " — VÉRIFICATION SEULE" : ""}\n`);
const branch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8" }).trim();
if (branch !== "espace-client") fail(`branche actuelle « ${branch} » : passez sur espace-client`);
if (!fs.existsSync(REL)) fail(`${REL} introuvable`);
const raw = fs.readFileSync(REL, "utf8");
const bom = raw.charCodeAt(0) === 0xfeff;
const eol = raw.includes("\r\n") ? "\r\n" : "\n";
let t = (bom ? raw.slice(1) : raw).replace(/\r\n/g, "\n");
if (t.includes(MARK)) { console.log("  \u00b7 déjà appliqué, rien à faire.\n"); process.exit(0); }
if (!t.includes("ZENORIA_ACCOUNT_STEP12_V1")) fail("l'étape 1.2 n'est pas appliquée sur pages/compte.js");

const start = t.indexOf("          {/* BANDEAU D'ACCUEIL");
const end = t.indexOf("          <div className=\"grid lg:grid-cols-[230px_1fr] gap-6\">");
if (start < 0 || end < 0 || end < start) fail("bloc du bandeau introuvable dans pages/compte.js");

const NEW = `          {/* BANDEAU D'ACCUEIL (${MARK}) : dégradé fin aux couleurs du site, photo adoucie et fondue à droite.
              Image modifiable dans Admin › Contenu du site (emplacement account_hero). */}
          <section
            data-testid="account-hero"
            className="relative rounded-[1.5rem] overflow-hidden h-[220px] sm:h-[240px] flex items-end sm:items-center mb-6 border border-[#efe4e6]"
            style={{
              background: [
                "radial-gradient(ellipse 55% 85% at 14% 35%, rgba(255,243,228,.95) 0%, rgba(255,243,228,0) 70%)",
                "radial-gradient(ellipse 40% 90% at 52% 70%, rgba(236,206,212,.38) 0%, rgba(236,206,212,0) 70%)",
                "linear-gradient(100deg, #fcf8f4 0%, #f9f0ec 30%, #f5e7e5 55%, #f1e1df 78%, #eedcd8 100%)",
              ].join(","),
            }}
          >
            {/* Photo : hauteur entière, calée à droite, adoucie, bord gauche fondu très progressivement */}
            <img
              src={heroUrl}
              alt=""
              aria-hidden="true"
              draggable="false"
              onError={() => setHeroUrl(DEFAULT_HERO)}
              className="absolute inset-y-0 right-0 h-full w-auto max-w-none select-none pointer-events-none"
              style={{
                filter: "contrast(.9) saturate(.88) brightness(1.04) sepia(.08)",
                WebkitMaskImage: "linear-gradient(to right, transparent 0%, rgba(0,0,0,.18) 16%, rgba(0,0,0,.5) 32%, rgba(0,0,0,.85) 50%, #000 64%)",
                maskImage: "linear-gradient(to right, transparent 0%, rgba(0,0,0,.18) 16%, rgba(0,0,0,.5) 32%, rgba(0,0,0,.85) 50%, #000 64%)",
              }}
            />
            {/* Voile poudré qui prolonge le dégradé sur la photo (ordinateur) */}
            <div
              aria-hidden="true"
              className="absolute inset-0 hidden sm:block"
              style={{ background: "linear-gradient(90deg, rgba(252,248,244,.92) 0%, rgba(250,241,237,.7) 26%, rgba(246,232,230,.32) 44%, rgba(243,226,224,.08) 60%, rgba(243,226,224,0) 72%)" }}
            />
            {/* Voile poudré en bas (mobile), sous le texte */}
            <div
              aria-hidden="true"
              className="absolute inset-0 sm:hidden"
              style={{ background: "linear-gradient(0deg, rgba(252,248,244,.96) 0%, rgba(249,239,235,.78) 38%, rgba(245,231,229,.25) 62%, rgba(245,231,229,0) 80%)" }}
            />
            {/* Léger voile chaud sur l'ensemble, pour harmoniser la photo avec la palette */}
            <div aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{ background: "rgba(246,230,222,.10)" }} />

            <div className="relative px-6 sm:px-10 py-6 max-w-md">
              <p className="text-[11px] uppercase tracking-[.28em] text-[#b48a5a]">Mon compte</p>
              <h1 className="font-serif text-3xl sm:text-4xl text-[#4a3743] mt-1.5">Bonjour</h1>
              <span aria-hidden="true" className="block h-px w-12 mt-3 mb-2.5" style={{ background: "linear-gradient(90deg, #c9a679, rgba(201,166,121,0))" }} />
              <p className="text-xs text-[#94808a] truncate">{user.email}</p>
            </div>
          </section>

`;
t = t.slice(0, start) + NEW + t.slice(end);
console.log("  \u2713 bloc du bandeau trouvé et remplacé");
if (DRY) { console.log("\nVérification réussie : 1 fichier serait écrit. Rien n'a été modifié.\n"); process.exit(0); }
fs.writeFileSync(REL, (bom ? "\uFEFF" : "") + (eol === "\r\n" ? t.replace(/\n/g, "\r\n") : t), "utf8");
console.log(`  \u2713 ${REL} modifié\n\nTerminé. Rechargez /compte avec Ctrl+F5.\n`);
