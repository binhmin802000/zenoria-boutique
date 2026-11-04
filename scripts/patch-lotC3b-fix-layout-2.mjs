// scripts/patch-lotC3b-fix-layout-2.mjs
// Correctif C3b-ter : la cellule de droite de chaque ligne de Configuration est en
// "shrink-0 text-right" => elle prend la largeur du texte le plus long non coupe
// (avertissement Stripe) et deborde sur la carte voisine.
// Pour les lignes sensibles : largeur bornee, pouvant retrecir, texte a gauche.
// Usage : node scripts/patch-lotC3b-fix-layout-2.mjs [--dry-run]
import fs from "fs";
import path from "path";

const DRY = process.argv.includes("--dry-run");
const FILE = path.join("components", "AdminConfig.js");
const FROM = '<div className="shrink-0 text-right">';
const TO = '<div className={it.sensitive ? "min-w-0 w-80 max-w-[65%] text-left" : "shrink-0 text-right"}>';

if (!fs.existsSync(FILE)) { console.error("Introuvable : " + FILE); process.exit(1); }
const raw = fs.readFileSync(FILE, "utf8");
if (raw.includes(TO)) { console.log("Deja applique. Rien a faire."); process.exit(0); }
const crlf = raw.includes("\r\n");
let src = raw.replace(/\r\n/g, "\n");
const n = src.split(FROM).length - 1;
if (n !== 1) { console.error("KO : " + n + " occurrence(s) de la cellule de droite (attendu : 1). Rien ecrit."); process.exit(1); }
src = src.replace(FROM, TO);
console.log("OK : cellule de droite des lignes sensibles bornee (w-80, max 65 %, retrecissable).");
if (crlf) src = src.replace(/\n/g, "\r\n");
if (DRY) { console.log("DRY-RUN : aucune ecriture."); process.exit(0); }
fs.writeFileSync(FILE, src);
console.log("Ecrit : " + FILE);
