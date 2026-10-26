// ZENORIA - Regroupement "Contenu du site" en accordeon (4 groupes)
// ============================================================
// Ce script modifie UNIQUEMENT components/AdminSiteMedia.js, et
// seulement si TOUS les controles reussissent. Si un seul echoue,
// AUCUNE ecriture n'est faite.
//
// Enveloppe les 7 composants existants (AdminSeasonFx, AdminRingAnimation,
// AdminShipping, AdminContact, AdminLegalPages, AdminSiteTexts, AdminCgv)
// dans 4 sections <AdminAccordionSection> :
//   - Vitrine & ambiance : AdminSeasonFx, AdminRingAnimation (ouvert par defaut)
//   - Textes & legal     : AdminLegalPages, AdminSiteTexts, AdminCgv
//   - Vente & livraison  : AdminShipping
//   - Contact            : AdminContact
// Un seul groupe ouvert a la fois (etat local openGroup).
// Aucun composant interne n'est modifie, seulement leur emballage.
//
// Usage :
//   node scripts/patch-admin-accordeon.mjs --dry-run
//   node scripts/patch-admin-accordeon.mjs --apply
// ============================================================

import fs from "node:fs";
import path from "node:path";

const apply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run");
if (!apply && !dryRun) {
  console.error("Utilisez --dry-run ou --apply.");
  process.exit(2);
}

const file = path.join(process.cwd(), "components", "AdminSiteMedia.js");
if (!fs.existsSync(file)) {
  console.error(`Fichier introuvable : ${file}`);
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
// A — Import de AdminAccordionSection, apres l'import de AdminCgv
// ------------------------------------------------------------
const IMPORT_NEEDLE = 'import AdminCgv from "@/components/AdminCgv";';
const importIdx = requireUnique(linesContaining(lines, IMPORT_NEEDLE), "import AdminCgv", IMPORT_NEEDLE);
lines = [
  ...lines.slice(0, importIdx + 1),
  'import AdminAccordionSection from "@/components/AdminAccordionSection";',
  ...lines.slice(importIdx + 1),
];
console.log("OK repere : import AdminAccordionSection ajoute");

// ------------------------------------------------------------
// B — Ajout de l'etat openGroup, juste apres "export default function"
// ------------------------------------------------------------
const FUNC_NEEDLE_IDXS = [];
lines.forEach((l, i) => { if (l.includes("export default function AdminSiteMedia()")) FUNC_NEEDLE_IDXS.push(i); });
const funcIdx = requireUnique(FUNC_NEEDLE_IDXS, "declaration du composant AdminSiteMedia", "export default function AdminSiteMedia()");
lines = [
  ...lines.slice(0, funcIdx + 1),
  '  const [openGroup, setOpenGroup] = useState("vitrine");',
  '  const toggleGroup = (id) => setOpenGroup((prev) => (prev === id ? null : id));',
  ...lines.slice(funcIdx + 1),
];
console.log("OK repere : etat openGroup ajoute (groupe \"vitrine\" ouvert par defaut)");

// ------------------------------------------------------------
// C — Remplacement du bloc des 7 composants par les 4 accordeons
// ------------------------------------------------------------
const START_NEEDLE = "<AdminSeasonFx />";
const END_NEEDLE = "<AdminCgv />";
const startIdxs = linesContaining(lines, START_NEEDLE);
const startIdx = requireUnique(startIdxs, "debut du bloc (AdminSeasonFx)", START_NEEDLE);
const endIdxs = linesContaining(lines, END_NEEDLE);
const endIdx = requireUnique(endIdxs, "fin du bloc (AdminCgv)", END_NEEDLE);
if (endIdx <= startIdx) {
  fail("fin du bloc trouvee avant son debut (ordre inattendu).");
}

const blockLines = lines.slice(startIdx - 1, endIdx + 1); // inclut le commentaire juste avant AdminSeasonFx
const blockText = blockLines.join(" ");
const requiredComponents = ["AdminSeasonFx", "AdminRingAnimation", "AdminShipping", "AdminContact", "AdminLegalPages", "AdminSiteTexts", "AdminCgv"];
const missingComponents = requiredComponents.filter((c) => !blockText.includes(`<${c} />`));
if (missingComponents.length > 0) {
  fail(`bloc des composants : elements manquants dans la zone reperee : ${missingComponents.join(", ")}.`);
}
console.log("OK verification : les 7 composants sont bien presents dans la zone a remplacer");

const newBlock = [
  "      <AdminAccordionSection",
  '        id="vitrine"',
  '        title="Vitrine & ambiance"',
  "        count={2}",
  '        isOpen={openGroup === "vitrine"}',
  "        onToggle={toggleGroup}",
  "      >",
  "        <AdminSeasonFx />",
  "        <AdminRingAnimation />",
  "      </AdminAccordionSection>",
  "",
  "      <AdminAccordionSection",
  '        id="textes-legal"',
  '        title="Textes & légal"',
  "        count={3}",
  '        isOpen={openGroup === "textes-legal"}',
  "        onToggle={toggleGroup}",
  "      >",
  "        <AdminLegalPages />",
  "        <AdminSiteTexts />",
  "        <AdminCgv />",
  "      </AdminAccordionSection>",
  "",
  "      <AdminAccordionSection",
  '        id="vente-livraison"',
  '        title="Vente & livraison"',
  "        count={1}",
  '        isOpen={openGroup === "vente-livraison"}',
  "        onToggle={toggleGroup}",
  "      >",
  "        <AdminShipping />",
  "      </AdminAccordionSection>",
  "",
  "      <AdminAccordionSection",
  '        id="contact"',
  '        title="Contact"',
  "        count={1}",
  '        isOpen={openGroup === "contact"}',
  "        onToggle={toggleGroup}",
  "      >",
  "        <AdminContact />",
  "      </AdminAccordionSection>",
];

lines = [
  ...lines.slice(0, startIdx - 1),
  ...newBlock,
  ...lines.slice(endIdx + 1),
];
console.log("OK repere : bloc des 7 composants remplace par 4 sections AdminAccordionSection");

// ------------------------------------------------------------
// Garde-fous finaux
// ------------------------------------------------------------
let text = lines.join(EOL);

if (countSubstring(text, "AdminAccordionSection") < 5) {
  fail(`garde-fou final : attendu au moins 5 occurrences de AdminAccordionSection (import + 4 usages), trouve ${countSubstring(text, "AdminAccordionSection")}.`);
}
for (const c of requiredComponents) {
  if (countSubstring(text, `<${c} />`) !== 1) {
    fail(`garde-fou final : <${c} /> attendu exactement 1 fois, trouve ${countSubstring(text, `<${c} />`)}.`);
  }
}
if (countSubstring(text, "openGroup") < 2) {
  fail("garde-fou final : l'etat openGroup n'est pas correctement branche.");
}
if (countSubstring(text, '"vitrine"') < 2) fail('garde-fou final : groupe "vitrine" incomplet.');
if (countSubstring(text, '"textes-legal"') < 2) fail('garde-fou final : groupe "textes-legal" incomplet.');
if (countSubstring(text, '"vente-livraison"') < 2) fail('garde-fou final : groupe "vente-livraison" incomplet.');
if (countSubstring(text, '"contact"') < 2) fail('garde-fou final : groupe "contact" incomplet.');
console.log("OK garde-fou : 4 groupes presents, 7 composants intacts, un seul groupe ouvert a la fois (etat openGroup)");

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
console.log("  - Import AdminAccordionSection");
console.log("  - Etat openGroup (vitrine ouvert par defaut, un seul groupe a la fois)");
console.log("  - 4 groupes : Vitrine & ambiance, Textes & legal, Vente & livraison, Contact");

if (dryRun) {
  console.log("");
  console.log("VERIFICATION SEULE : aucun fichier modifie.");
} else {
  fs.writeFileSync(file, text, "utf8");
  console.log("");
  console.log(`Fichier modifie : ${path.relative(process.cwd(), file)}`);
}