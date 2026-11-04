// scripts/patch-lotC3b-fix-knob.mjs
// Correctif C3b-quater : la pastille blanche de SensitiveSwitch n'a pas d'ancrage
// horizontal (pas de "left-*") : dans un <button>, sa position de depart est centree,
// puis translate-x-5 la fait sortir de la piste. On l'ancre a gauche (left-0.5)
// et on garde uniquement le decalage de 20 px a l'etat actif.
// Usage : node scripts/patch-lotC3b-fix-knob.mjs [--dry-run]
import fs from "fs";
import path from "path";

const DRY = process.argv.includes("--dry-run");
const FILE = path.join("components", "SensitiveSwitch.js");
const MARK = "ZENORIA_CONFIG_C3B_KNOB_V1";

const replacements = [
  { label: "ancrage a gauche de la pastille", from: "absolute top-0.5 h-5 w-5", to: "absolute left-0.5 top-0.5 h-5 w-5" },
  { label: "etat inactif sans decalage parasite", from: 'checked ? "translate-x-5" : "translate-x-0.5"', to: 'checked ? "translate-x-5" : "translate-x-0"' },
];

if (!fs.existsSync(FILE)) { console.error("Introuvable : " + FILE); process.exit(1); }
const raw = fs.readFileSync(FILE, "utf8");
if (raw.includes(MARK)) { console.log("Deja applique. Rien a faire."); process.exit(0); }
const crlf = raw.includes("\r\n");
let src = raw.replace(/\r\n/g, "\n");
for (const r of replacements) {
  const n = src.split(r.from).length - 1;
  if (n !== 1) { console.error("KO (" + n + " occurrence(s)) : " + r.label + ". Rien ecrit."); process.exit(1); }
  src = src.replace(r.from, r.to);
  console.log("OK : " + r.label);
}
src = src.replace("// components/SensitiveSwitch.js\n", "// components/SensitiveSwitch.js\n// " + MARK + "\n");
if (crlf) src = src.replace(/\n/g, "\r\n");
if (DRY) { console.log("DRY-RUN : aucune ecriture."); process.exit(0); }
fs.writeFileSync(FILE, src);
console.log("Ecrit : " + FILE);
