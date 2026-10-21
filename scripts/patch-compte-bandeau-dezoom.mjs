// ============================================================
// scripts/patch-compte-bandeau-dezoom.mjs — Espace cliente : bandeau « dézoomé », bijou entier à droite
// ZENORIA_ACCOUNT_HERO_FIT_V1
//
// Avant : l'image remplissait toute la largeur (« cover ») -> sur un bandeau très large, elle était
//         agrandie et coupée en haut et en bas : bague trop zoomée et décentrée.
// Après : l'image garde toute sa hauteur (bague entière), est calée à droite, et son bord gauche se fond
//         progressivement dans l'ivoire (masque dégradé) ; le reste du bandeau est ivoire.
// Usage (dossier zenoria, branche espace-client, étape 1.2 appliquée) :
//   node scripts\patch-compte-bandeau-dezoom.mjs --dry-run
//   node scripts\patch-compte-bandeau-dezoom.mjs
// ============================================================
import fs from "node:fs";
import { execSync } from "node:child_process";

const MARK = "ZENORIA_ACCOUNT_HERO_FIT_V1";
const REL = "pages/compte.js";
const DRY = process.argv.includes("--dry-run");
const fail = (m) => { console.error(`\n\u2717 ARRÊT : ${m}\nAucun fichier n'a été modifié.\n`); process.exit(1); };

console.log(`\nBandeau Mon compte : dézoom${DRY ? " — VÉRIFICATION SEULE" : ""}\n`);
const branch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8" }).trim();
if (branch !== "espace-client") fail(`branche actuelle « ${branch} » : passez sur espace-client`);
if (!fs.existsSync(REL)) fail(`${REL} introuvable`);
let raw = fs.readFileSync(REL, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";
let t = raw.replace(/\r\n/g, "\n");
if (t.includes(MARK)) { console.log("  \u00b7 déjà appliqué, rien à faire.\n"); process.exit(0); }
if (!t.includes("ZENORIA_ACCOUNT_STEP12_V1")) fail("l'étape 1.2 n'est pas appliquée sur pages/compte.js");

const start = t.indexOf("          {/* BANDEAU D'ACCUEIL");
const end = t.indexOf("          <div className=\"grid lg:grid-cols-[230px_1fr] gap-6\">");
if (start < 0 || end < 0 || end < start) fail("bloc du bandeau introuvable dans pages/compte.js");

const NEW = `          {/* BANDEAU D'ACCUEIL (${MARK}) : image entière calée à droite, bord gauche fondu dans l'ivoire.
              Image modifiable dans Admin › Contenu du site (emplacement account_hero). */}
          <section
            data-testid="account-hero"
            className="relative rounded-[1.5rem] overflow-hidden h-[220px] sm:h-[240px] flex items-end sm:items-center mb-6 bg-[#fbf8f4] border border-[#eadfe4]"
          >
            <img
              src={heroUrl}
              alt=""
              aria-hidden="true"
              draggable="false"
              onError={() => setHeroUrl(DEFAULT_HERO)}
              className="absolute inset-y-0 right-0 h-full w-auto max-w-none select-none pointer-events-none"
              style={{
                WebkitMaskImage: "linear-gradient(to right, transparent 0%, rgba(0,0,0,.55) 18%, #000 42%)",
                maskImage: "linear-gradient(to right, transparent 0%, rgba(0,0,0,.55) 18%, #000 42%)",
              }}
            />
            <div aria-hidden="true" className="absolute inset-0 hidden sm:block" style={{ background: "linear-gradient(90deg,rgba(251,248,244,.96) 0%,rgba(251,248,244,.7) 30%,rgba(251,248,244,0) 48%)" }} />
            <div aria-hidden="true" className="absolute inset-0 sm:hidden" style={{ background: "linear-gradient(0deg,rgba(251,248,244,.97) 0%,rgba(251,248,244,.75) 40%,rgba(251,248,244,0) 72%)" }} />
            <div className="relative px-6 sm:px-8 py-6 max-w-md">
              <p className="text-[11px] uppercase tracking-[.25em] text-[#b48a5a]">Mon compte</p>
              <h1 className="font-serif text-3xl sm:text-4xl text-[#412f3b] mt-1">Bonjour</h1>
              <p className="text-xs text-[#8b737e] mt-1 truncate">{user.email}</p>
            </div>
          </section>

`;
t = t.slice(0, start) + NEW + t.slice(end);
console.log("  \u2713 bloc du bandeau trouvé et remplacé");
if (DRY) { console.log("\nVérification réussie : 1 fichier serait écrit. Rien n'a été modifié.\n"); process.exit(0); }
fs.writeFileSync(REL, (raw.charCodeAt(0) === 0xfeff ? "\uFEFF" : "") + (eol === "\r\n" ? t.replace(/^\uFEFF/, "").replace(/\n/g, "\r\n") : t.replace(/^\uFEFF/, "")), "utf8");
console.log(`  \u2713 ${REL} modifié\n\nTerminé. Suite : npm run dev, puis rechargez /compte (Ctrl+F5).\n`);
