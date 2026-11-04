// scripts/patch-lotC3b-fix-layout.mjs
// Correctif de mise en page de SensitiveSwitch (lot C3b) :
// le panneau de confirmation debordait quand warningText etait long
// (ligne non coupee + texte aligne a droite herites de la ligne parente).
// Usage : node scripts/patch-lotC3b-fix-layout.mjs [--dry-run]
import fs from "fs";
import path from "path";

const DRY = process.argv.includes("--dry-run");
const FILE = path.join("components", "SensitiveSwitch.js");
const MARK = "ZENORIA_CONFIG_C3B_LAYOUT_V1";

const replacements = [
  {
    label: "racine : reset nowrap / text-right herites, largeur bornee",
    from: 'className="rounded-xl border border-[#e7d9e2] bg-white p-4"',
    to: 'className="w-full min-w-0 max-w-full whitespace-normal break-words text-left rounded-xl border border-[#e7d9e2] bg-white p-4"',
  },
  {
    label: "panneau : autoriser le retrecissement du contenu",
    from: '<div className="flex-1">',
    to: '<div className="min-w-0 flex-1">',
  },
];

if (!fs.existsSync(FILE)) { console.error("Introuvable : " + FILE); process.exit(1); }
const raw = fs.readFileSync(FILE, "utf8");
if (raw.includes(MARK)) { console.log("Deja applique (" + MARK + "). Rien a faire."); process.exit(0); }

const crlf = raw.includes("\r\n");
let src = raw.replace(/\r\n/g, "\n");
for (const r of replacements) {
  const n = src.split(r.from).length - 1;
  if (n !== 1) { console.error("KO (" + n + " occurrence(s)) : " + r.label); process.exit(1); }
  src = src.replace(r.from, r.to);
  console.log("OK : " + r.label);
}
src = src.replace("// components/SensitiveSwitch.js\n", "// components/SensitiveSwitch.js\n// " + MARK + "\n");
if (crlf) src = src.replace(/\n/g, "\r\n");
if (DRY) { console.log("DRY-RUN : aucune ecriture."); process.exit(0); }
fs.writeFileSync(FILE, src);
console.log("Ecrit : " + FILE);
