#!/usr/bin/env node
// ============================================================
// COMPLEMENT LOT 2d : la pastille d'une bague reservee affiche « En cours de commande » au lieu de « Réservée »
// (choix B). Bijoux normaux et pieces uniques. Modifie uniquement lib/shopUtils.js (2 occurrences).
// A appliquer sur la branche lot2d-reserve, APRES patch-lot2d-reserve.mjs.
//   node scripts/patch-lot2d-libelle.mjs --dry-run
//   node scripts/patch-lot2d-libelle.mjs --apply
// ============================================================
import fs from "node:fs";
const PATH = "lib/shopUtils.js";
const OLD = 'label: "Réservée"';
const NEW = 'label: "En cours de commande"';
const mode = process.argv.includes("--apply") ? "apply" : process.argv.includes("--dry-run") ? "dry" : null;
function fail(m) { console.error("\nECHEC : " + m); console.error("Aucun fichier n'a ete modifie."); process.exit(1); }
if (!mode) fail("indiquez --dry-run ou --apply.");
if (!fs.existsSync(PATH)) fail(PATH + " introuvable. Lancez la commande depuis la racine du projet (dossier zenoria).");
const original = fs.readFileSync(PATH, "utf8");
if (!original.includes("ZENORIA_STOCK_UI3_V1")) fail("le patch 2d (patch-lot2d-reserve.mjs) n'est pas applique.");
if (original.includes(NEW)) fail("le complement est deja applique.");
const n = original.split(OLD).length - 1;
console.log("Mode : " + (mode === "apply" ? "APPLICATION" : "DRY-RUN (aucune ecriture)") + "\n" + PATH);
console.log((n === 2 ? "  OK  " : " ERREUR ") + OLD + " : " + n + " occurrence(s) (2 attendues : bijou normal et piece unique)");
if (n !== 2) fail("nombre d'occurrences inattendu.");
const out = original.split(OLD).join(NEW);
if (mode === "dry") { console.log("\nDRY-RUN termine : conforme. Rien n'a ete ecrit."); process.exit(0); }
fs.writeFileSync(PATH, out, "utf8");
console.log("\nCOMPLEMENT APPLIQUE. Retour arriere avant commit : git restore lib/shopUtils.js");
