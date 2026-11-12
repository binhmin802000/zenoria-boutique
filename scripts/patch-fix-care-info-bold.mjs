// ============================================================
// CORRECTIF — LE GRAS DE L'ENTRETIEN DU BIJOU N'ETAIT PAS VISIBLE — ZENORIA_CARE_INFO_BOLD_FIX_V1
//
// Cause : "font-medium" (graisse 500) n'existe pas dans beaucoup de polices web, qui ne chargent
// souvent que 400 (normal) et 700 (gras). Le navigateur retombe alors sur 400 : le gras devenait
// invisible a l'ecran, sans erreur ni message. Remplace par "font-bold" (graisse 700), presente
// dans la quasi-totalite des polices.
//
// Modifie : components/CareInfoText.js (uniquement). Ce composant est partage par l'apercu admin,
// la fiche produit et la page /entretien : un seul correctif s'applique aux trois.
//
// Tout ou rien. Fins de ligne (CRLF/LF) conservees. Relancer apres succes est refuse.
// Usage : node scripts/patch-fix-care-info-bold.mjs
// ============================================================
import fs from "node:fs";
import path from "node:path";

const TAG = "[patch-fix-care-info-bold]";
const FILE = "components/CareInfoText.js";
const MARKER = "ZENORIA_CARE_INFO_BOLD_FIX_V1";
const full = path.join(process.cwd(), FILE);

if (!fs.existsSync(full)) {
  console.error(TAG + " " + FILE + " : fichier introuvable. RIEN n'a ete ecrit.");
  process.exit(1);
}
const raw = fs.readFileSync(full, "utf8");
const crlf = raw.includes("\r\n");
const text = raw.replace(/\r\n/g, "\n");

if (text.includes(MARKER)) {
  console.error(TAG + " deja applique (" + MARKER + " present). RIEN n'a ete ecrit.");
  process.exit(1);
}

const find = 'if (seg.bold) node = <strong key="b" className="font-medium">{node}</strong>;';
const n = text.split(find).length - 1;
if (n !== 1) {
  console.error(TAG + " repere trouve " + n + " fois (attendu : 1). RIEN n'a ete ecrit.");
  process.exit(1);
}
const replacement = 'if (seg.bold) node = <strong key="b" className="font-bold">{node}</strong>; // ' + MARKER;
const patched = text.replace(find, replacement);

fs.writeFileSync(full, crlf ? patched.replace(/\n/g, "\r\n") : patched, "utf8");
console.log(TAG + " 1 fichier mis a jour : " + FILE + " (" + (crlf ? "CRLF" : "LF") + ")");
