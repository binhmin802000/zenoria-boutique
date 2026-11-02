#!/usr/bin/env node
// ============================================================
// CORRECTIF LOT 2c : la pastille de la fiche (vitrine et quiz) affichait le texte prevu pour le panier
// (« N'est plus disponible : retirez cet article pour continuer. »). Ce texte ne doit plus apparaitre
// dans la pastille : elle affiche seulement « Épuisé » ou « Disponible ». Les messages du panier viennent
// de CartLineNotice (lot 2c-2) et ne sont pas touches. Modifie uniquement lib/shopUtils.js.
//   node scripts/patch-lot2c3-pastille.mjs --dry-run
//   node scripts/patch-lot2c3-pastille.mjs --apply
// ============================================================
import fs from "node:fs";
const MARKER = "ZENORIA_STOCK_UI2C_V1";
const PATH = "lib/shopUtils.js";
const mode = process.argv.includes("--apply") ? "apply" : process.argv.includes("--dry-run") ? "dry" : null;
function fail(m) { console.error("\nECHEC : " + m); console.error("Aucun fichier n'a ete modifie."); process.exit(1); }
if (!mode) fail("indiquez --dry-run ou --apply.");
if (!fs.existsSync(PATH)) fail(PATH + " introuvable. Lancez la commande depuis la racine du projet (dossier zenoria).");
const original = fs.readFileSync(PATH, "utf8");
const crlf = original.includes("\r\n");
let c = original.replace(/\r\n/g, "\n");
if (c.includes(MARKER)) fail("le correctif est deja applique.");
if (!c.includes("ZENORIA_STOCK_UI2_V1")) fail("le patch 2c-2 n'est pas applique.");
const PAIRS = [
  ['detail: "N\'est plus disponible : retirez cet article pour continuer." };', 'detail: "" }; // ' + MARKER + " : pastille sans texte de panier"],
  ['detail: "Quantité supérieure au stock : réduisez-la pour continuer." };', 'detail: "" };'],
];
console.log("Mode : " + (mode === "apply" ? "APPLICATION" : "DRY-RUN (aucune ecriture)") + "\n" + PATH + " (fins de ligne " + (crlf ? "Windows CRLF" : "Unix LF") + ")");
const bad = [];
for (const [o] of PAIRS) { const n = c.split(o).length - 1; console.log((n === 1 ? "  OK  " : " ERREUR ") + o.slice(0, 60) + "… : " + n + " occurrence(s)"); if (n !== 1) bad.push(o); }
if (bad.length) fail("repere(s) introuvable(s) ou en double.");
for (const [o, n] of PAIRS) c = c.replace(o, () => n);
if (c.includes("retirez cet article") || c.includes("réduisez-la")) fail("controle final : texte de panier encore present.");
if (mode === "dry") { console.log("\nDRY-RUN termine : conforme. Rien n'a ete ecrit."); process.exit(0); }
fs.writeFileSync(PATH, crlf ? c.replace(/\n/g, "\r\n") : c, "utf8");
console.log("\nCORRECTIF APPLIQUE. Retour arriere avant commit : git restore lib/shopUtils.js");
