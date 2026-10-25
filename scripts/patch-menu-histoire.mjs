// ZENORIA - Ajout "Notre histoire" au menu principal (desktop + mobile)
// ============================================================
// Ce script modifie UNIQUEMENT pages/index.js, et seulement si TOUS les
// controles reussissent. Si un seul echoue, AUCUNE ecriture n'est faite.
//
// Insere un lien "Notre histoire" entre "Savoir-faire" et "Notre philosophie",
// dans le menu desktop ET le menu mobile. Reprend EXACTEMENT le mecanisme
// deja utilise ailleurs : window.dispatchEvent(new Event(OPEN_STORY_EVENT)).
// Aucun nouvel import necessaire (OPEN_STORY_EVENT deja importe).
//
// Usage :
//   node scripts/patch-menu-histoire.mjs --dry-run
//   node scripts/patch-menu-histoire.mjs --apply
// ============================================================

import fs from "node:fs";
import path from "node:path";

const apply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run");
if (!apply && !dryRun) {
  console.error("Utilisez --dry-run ou --apply.");
  process.exit(2);
}

const file = path.join(process.cwd(), "pages", "index.js");
if (!fs.existsSync(file)) {
  console.error(`Fichier introuvable : ${file}`);
  console.error("Lancez ce script depuis la racine du projet (dossier zenoria).");
  process.exit(1);
}

const original = fs.readFileSync(file, "utf8");
const hasCRLF = /\r\n/.test(original);
const EOL = hasCRLF ? "\r\n" : "\n";

function fail(message) {
  console.error(`ECHEC : ${message}`);
  console.error("Aucune modification n'a ete ecrite.");
  process.exit(1);
}

function countSubstring(haystack, needle) {
  let count = 0, pos = 0;
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count++;
    pos += needle.length;
  }
  return count;
}

function linesContaining(lines, needle) {
  const idxs = [];
  lines.forEach((l, i) => { if (l.includes(needle)) idxs.push(i); });
  return idxs;
}

function requireUnique(idxs, label, needle) {
  if (idxs.length !== 1) {
    fail(`${label} : attendu 1 occurrence de ${JSON.stringify(needle)}, trouve ${idxs.length}.`);
  }
  return idxs[0];
}

let lines = original.split(/\r\n|\n/);

// ------------------------------------------------------------
// A — Menu desktop : apres le bouton "Savoir-faire"
// ------------------------------------------------------------
const DESKTOP_SAVOIR_FAIRE = '<button onClick={() => scrollToSection("savoir-faire")} className="hover:text-[#8f6075]">Savoir-faire</button>';
const dIdx = requireUnique(linesContaining(lines, DESKTOP_SAVOIR_FAIRE), "menu desktop : bouton Savoir-faire", DESKTOP_SAVOIR_FAIRE);
const dIndentMatch = lines[dIdx].match(/^(\s*)/);
const dIndent = dIndentMatch ? dIndentMatch[1] : "            ";
const desktopNewLine = `${dIndent}<button onClick={() => window.dispatchEvent(new Event(OPEN_STORY_EVENT))} data-testid="nav-histoire" className="hover:text-[#8f6075]">Notre histoire</button>`;
lines = [...lines.slice(0, dIdx + 1), desktopNewLine, ...lines.slice(dIdx + 1)];
console.log("OK repere : menu desktop — Notre histoire insere apres Savoir-faire");

// ------------------------------------------------------------
// B — Menu mobile : apres le bouton "Savoir-faire"
// ------------------------------------------------------------
const MOBILE_SAVOIR_FAIRE = '<button onClick={() => { scrollToSection("savoir-faire"); setMenu(false); }} className="text-left">Savoir-faire</button>';
const mIdx = requireUnique(linesContaining(lines, MOBILE_SAVOIR_FAIRE), "menu mobile : bouton Savoir-faire", MOBILE_SAVOIR_FAIRE);
const mIndentMatch = lines[mIdx].match(/^(\s*)/);
const mIndent = mIndentMatch ? mIndentMatch[1] : "            ";
const mobileNewLine = `${mIndent}<button onClick={() => { window.dispatchEvent(new Event(OPEN_STORY_EVENT)); setMenu(false); }} data-testid="nav-histoire-mobile" className="text-left">Notre histoire</button>`;
lines = [...lines.slice(0, mIdx + 1), mobileNewLine, ...lines.slice(mIdx + 1)];
console.log("OK repere : menu mobile — Notre histoire insere apres Savoir-faire");

// ------------------------------------------------------------
// Garde-fous finaux
// ------------------------------------------------------------
let text = lines.join(EOL);

if (countSubstring(text, 'data-testid="nav-histoire"') !== 1) {
  fail('garde-fou final : attendu 1 occurrence de data-testid="nav-histoire".');
}
if (countSubstring(text, 'data-testid="nav-histoire-mobile"') !== 1) {
  fail('garde-fou final : attendu 1 occurrence de data-testid="nav-histoire-mobile".');
}
if (countSubstring(text, "window.dispatchEvent(new Event(OPEN_STORY_EVENT))") !== 4) {
  fail(
    "garde-fou final : attendu 4 occurrences de dispatchEvent(OPEN_STORY_EVENT) " +
    "(bouton Philosophie + carte univers-zenoria + menu desktop + menu mobile), trouve " +
    countSubstring(text, "window.dispatchEvent(new Event(OPEN_STORY_EVENT))") + "."
  );
}
if (countSubstring(text, "Savoir-faire</button>") < 2) {
  fail("garde-fou final : les boutons Savoir-faire existants semblent avoir disparu.");
}
console.log("OK garde-fou : Notre histoire present dans les 2 menus, mecanisme OPEN_STORY_EVENT conforme (4 occurrences)");

// ------------------------------------------------------------
// Resultat
// ------------------------------------------------------------
if (text === original) {
  fail("aucune modification produite malgre les controles reussis (cas inattendu).");
}

console.log("");
console.log(`Mode : ${dryRun ? "DRY-RUN" : "APPLY"}`);
console.log("Tous les controles sont conformes.");
console.log("Modifications preparees :");
console.log("  - Menu desktop : lien \"Notre histoire\" entre Savoir-faire et Notre philosophie");
console.log("  - Menu mobile : lien \"Notre histoire\" entre Savoir-faire et Notre philosophie");

if (dryRun) {
  console.log("");
  console.log("VERIFICATION SEULE : aucun fichier modifie.");
} else {
  fs.writeFileSync(file, text, "utf8");
  console.log("");
  console.log(`Fichier modifie : ${path.relative(process.cwd(), file)}`);
}