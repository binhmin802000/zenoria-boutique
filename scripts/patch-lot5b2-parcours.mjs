#!/usr/bin/env node
// ============================================================
// COMPLÉMENT LOT 5b : « Parcours des commandes » en 5 blocs de même largeur
// (En attente, Payées, Expédiées, Livrées, Annulées), chacun avec son nombre de commandes, même à 0.
// Modifie uniquement components/AdminCrm.js. À appliquer APRÈS patch-lot5b-commandes.mjs.
//   node scripts/patch-lot5b2-parcours.mjs --dry-run
//   node scripts/patch-lot5b2-parcours.mjs --apply
// ============================================================
import fs from "node:fs";
const PATH = "components/AdminCrm.js";
const MARKER = "ZENORIA_ORDERS_5B2_V1";
const mode = process.argv.includes("--apply") ? "apply" : process.argv.includes("--dry-run") ? "dry" : null;
function fail(m) { console.error("\nECHEC : " + m); console.error("Aucun fichier n'a ete modifie."); process.exit(1); }
if (!mode) fail("indiquez --dry-run ou --apply.");
if (!fs.existsSync(PATH)) fail(PATH + " introuvable. Lancez la commande depuis la racine du projet (dossier zenoria).");
const original = fs.readFileSync(PATH, "utf8");
const crlf = original.includes("\r\n");
let c = original.replace(/\r\n/g, "\n");
if (c.includes(MARKER)) fail("le complement est deja applique.");
if (!c.includes("ZENORIA_ORDERS_5B_V1")) fail("le lot 5b n'est pas applique.");
const PAIRS = [
  ["P1 les 5 etats toujours affiches",
   ".length })).filter((s) => s.count > 0);",
   ".length })); // " + MARKER + " : les 5 états sont toujours affichés, même à 0"],
  ["P2 blocs de meme largeur",
   'style={{ flex: s.count, background: s.color, boxShadow: statusFilter === s.key ? "inset 0 0 0 3px #342b32" : "none" }}',
   'style={{ flex: 1, background: s.color, opacity: s.count ? 1 : 0.5, boxShadow: statusFilter === s.key ? "inset 0 0 0 3px #342b32" : "none" }}'],
  ["P3 hauteur du bloc",
   'className="h-10 min-w-0 px-1 text-[11px] font-semibold text-white whitespace-nowrap overflow-hidden"',
   'className="h-16 min-w-0 px-1 text-white text-center overflow-hidden"'],
  ["P4 libelle et nombre sur deux lignes",
   "{s.label} {s.count}",
   '<span className="block text-[11px] font-medium truncate">{s.label}</span>\n                  <span className="block font-serif text-2xl leading-7">{s.count}</span>'],
];
console.log("Mode : " + (mode === "apply" ? "APPLICATION" : "DRY-RUN (aucune ecriture)") + "\n" + PATH + " (fins de ligne " + (crlf ? "Windows CRLF" : "Unix LF") + ")");
const bad = [];
for (const [n, o] of PAIRS) { const k = c.split(o).length - 1; console.log((k === 1 ? "  OK  " : " ERREUR ") + n + " : " + k + " occurrence(s)"); if (k !== 1) bad.push(n); }
if (bad.length) fail("repere(s) introuvable(s) ou en double : " + bad.join(", "));
for (const [, o, r] of PAIRS) c = c.replace(o, () => r);
if (mode === "dry") { console.log("\nDRY-RUN termine : conforme. Rien n'a ete ecrit."); process.exit(0); }
fs.writeFileSync(PATH, crlf ? c.replace(/\n/g, "\r\n") : c, "utf8");
console.log("\nCOMPLEMENT APPLIQUE. Retour arriere avant commit : git restore components/AdminCrm.js (annule aussi le lot 5b s'il n'est pas commite)");
