#!/usr/bin/env node
// ============================================================
// patch-retrait-prototype-footer.mjs  -  ZENORIA_FOOTER_NOPROTO_V1
//
// Retire la mention "Prototype e-commerce." du pied de page partage (components/Footer.js).
// Seule la phrase "Prototype e-commerce." disparait : le copyright et l'avertissement sur les photos/videos restent.
//
// Utilisation (depuis la racine du projet) :
//   node scripts/patch-retrait-prototype-footer.mjs --dry-run   (controle l'ancre, n'ecrit rien)
//   node scripts/patch-retrait-prototype-footer.mjs             (applique)
//
// Le script s'arrete sans rien ecrire si l'ancre est absente, en double ou inattendue.
// ============================================================
import fs from "node:fs";
import path from "node:path";

const DRY = process.argv.includes("--dry-run");
const ROOT = process.cwd();
const MARK = "ZENORIA_FOOTER_NOPROTO_V1";

function stop(msg) {
  console.error("\nARRET : " + msg + "\nRien n'a ete ecrit.");
  process.exit(1);
}
const count = (s, sub) => s.split(sub).length - 1;

const rel = "components/Footer.js";
const file = path.join(ROOT, ...rel.split("/"));
if (!fs.existsSync(file)) stop(rel + " introuvable (lance le script depuis la racine du projet).");
const raw = fs.readFileSync(file, "utf8");
const crlf = (raw.match(/\r\n/g) || []).length;
const lf = (raw.match(/\n/g) || []).length - crlf;
if (crlf > 0 && lf > 0) stop(rel + " melange des fins de ligne CRLF et LF (" + crlf + " CRLF, " + lf + " LF) : je ne touche pas a un fichier dans cet etat.");
const eol = crlf > 0 ? "\r\n" : "\n";
const text = raw.replace(/\r\n/g, "\n");

if (text.includes(MARK)) stop("le marqueur " + MARK + " est deja present dans " + rel + " : lot deja applique.");

const FROM = '<div>Photos et vidéos © 2026 Zenoria, reproduction interdite sans autorisation. Prototype e-commerce.</div>';
const TO = '<div>Photos et vidéos © 2026 Zenoria, reproduction interdite sans autorisation.</div> {/* ' + MARK + ' : mention retiree */}';

const n = count(text, FROM);
if (n !== 1) stop(rel + " : ancre (ligne du pied de page) trouvee " + n + " fois (attendu : 1). Le fichier a change depuis l'audit.");

const next = text.replace(FROM, () => TO);
if (next.includes("Prototype e-commerce")) stop("controle final : « Prototype e-commerce » est encore present apres remplacement.");
if (!next.includes(MARK)) stop("controle final : le marqueur n'a pas ete insere.");

console.log("Retrait de « Prototype e-commerce. » du pied de page");
console.log(" - fin de ligne detectee : " + (eol === "\r\n" ? "CRLF" : "LF"));
console.log(" - " + rel + " : 1 ligne modifiee (phrase retiree, copyright conserve)");

if (DRY) {
  console.log("\nDRY-RUN OK : l'ancre est unique et conforme. Rien n'a ete ecrit.");
  process.exit(0);
}
fs.writeFileSync(file, eol === "\r\n" ? next.replace(/\n/g, "\r\n") : next, "utf8");
console.log("\nOK : fichier ecrit. Lance maintenant : npm run build");
