// ZENORIA - Branchement de l'onglet RGPD dans pages/admin.js
// ============================================================
// Ce script modifie UNIQUEMENT pages/admin.js, et seulement si TOUS
// les controles reussissent. Si un seul echoue, AUCUNE ecriture n'est
// faite.
//
// Ajoute : import AdminDataRequests + icone ShieldCheck, etat
// rgpdPendingCount, badge numerique sur l'onglet rgpd, rendu du
// composant quand tab === "rgpd".
//
// Usage :
//   node scripts/patch-admin-rgpd-onglet.mjs --dry-run
//   node scripts/patch-admin-rgpd-onglet.mjs --apply
// ============================================================

import fs from "node:fs";
import path from "node:path";

const apply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run");
if (!apply && !dryRun) {
  console.error("Utilisez --dry-run ou --apply.");
  process.exit(2);
}

const file = path.join(process.cwd(), "pages", "admin.js");
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
// A — Import de AdminDataRequests, apres l'import AdminReviews
// ------------------------------------------------------------
const IMPORT_NEEDLE = 'import AdminReviews from "@/components/AdminReviews";';
const importIdx = requireUnique(linesContaining(lines, IMPORT_NEEDLE), "import AdminReviews", IMPORT_NEEDLE);
lines = [
  ...lines.slice(0, importIdx + 1),
  'import AdminDataRequests from "@/components/AdminDataRequests";',
  ...lines.slice(importIdx + 1),
];
console.log("OK repere : import AdminDataRequests ajoute");

// ------------------------------------------------------------
// B — Icone ShieldCheck ajoutee a TAB_ICONS (reutilise l'icone deja
// utilisee visuellement pour RGPD dans AdminDataRequests, pour la
// coherence). On suppose que ShieldCheck est deja importe depuis
// lucide-react ailleurs dans ce fichier (verification par garde-fou).
// ------------------------------------------------------------
const TAB_ICONS_NEEDLE = "avenir: Clock,";
const tabIconsIdx = requireUnique(linesContaining(lines, TAB_ICONS_NEEDLE), "TAB_ICONS (ligne avenir: Clock,)", TAB_ICONS_NEEDLE);
lines = [
  ...lines.slice(0, tabIconsIdx + 1),
  "  rgpd: ShieldCheck,",
  ...lines.slice(tabIconsIdx + 1),
];
console.log("OK repere : rgpd ajoute a TAB_ICONS");

// ------------------------------------------------------------
// C — Etat rgpdPendingCount, apres sidebarCollapsed
// ------------------------------------------------------------
const STATE_NEEDLE = "const [sidebarCollapsed, setSidebarCollapsed] = useState(false);";
const stateIdx = requireUnique(linesContaining(lines, STATE_NEEDLE), "etat sidebarCollapsed", STATE_NEEDLE);
lines = [
  ...lines.slice(0, stateIdx + 1),
  "  const [rgpdPendingCount, setRgpdPendingCount] = useState(0);",
  ...lines.slice(stateIdx + 1),
];
console.log("OK repere : etat rgpdPendingCount ajoute");

// ------------------------------------------------------------
// D — Badge numerique sur l'onglet rgpd, sur le modele de quota-dot
// ------------------------------------------------------------
const QUOTA_DOT_NEEDLE = 'data-testid="quota-dot"';
const quotaDotIdx = requireUnique(linesContaining(lines, QUOTA_DOT_NEEDLE), "bloc quota-dot (modele pour le badge rgpd)", QUOTA_DOT_NEEDLE);
// Remonte jusqu'au debut du bloc conditionnel {t.id === "quotas" && (
let condStart = -1;
for (let i = quotaDotIdx; i >= Math.max(0, quotaDotIdx - 5); i--) {
  if (lines[i].includes('t.id === "quotas"')) { condStart = i; break; }
}
if (condStart === -1) fail("bloc quota-dot : debut du bloc conditionnel introuvable.");
// Trouve la fin du bloc : la ligne ")}" qui suit
let condEnd = -1;
for (let i = quotaDotIdx; i < Math.min(lines.length, quotaDotIdx + 6); i++) {
  if (lines[i].trim() === ")}") { condEnd = i; break; }
}
if (condEnd === -1) fail("bloc quota-dot : fin du bloc conditionnel introuvable.");
const condIndentMatch = lines[condStart].match(/^(\s*)/);
const condIndent = condIndentMatch ? condIndentMatch[1] : "                            ";

const rgpdBadgeLines = [
  `${condIndent}{t.id === "rgpd" && rgpdPendingCount > 0 && (`,
  `${condIndent}  <span`,
  `${condIndent}    data-testid="rgpd-pending-badge"`,
  `${condIndent}    className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#8f6075] text-white text-[10px] font-medium flex items-center justify-center shrink-0"`,
  `${condIndent}    aria-label={\`${"${rgpdPendingCount}"} demande(s) RGPD en attente\`}`,
  `${condIndent}  >`,
  `${condIndent}    {rgpdPendingCount}`,
  `${condIndent}  </span>`,
  `${condIndent})}`,
];

lines = [
  ...lines.slice(0, condEnd + 1),
  ...rgpdBadgeLines,
  ...lines.slice(condEnd + 1),
];
console.log("OK repere : badge numerique rgpd ajoute apres le bloc quota-dot");

// ------------------------------------------------------------
// E — Rendu du composant, apres {tab === "avenir" && <CrmRoadmap />}
// ------------------------------------------------------------
let text = lines.join(EOL);
const RENDER_NEEDLE = '{tab === "avenir" && <CrmRoadmap />}';
const renderCount = countSubstring(text, RENDER_NEEDLE);
if (renderCount !== 1) {
  fail(`rendu avenir : attendu 1 occurrence exacte de ${JSON.stringify(RENDER_NEEDLE)}, trouve ${renderCount}.`);
}
const RENDER_NEW = `${RENDER_NEEDLE}${EOL}${EOL}        {tab === "rgpd" && <AdminDataRequests onPendingCountChange={setRgpdPendingCount} />}`;
text = text.replace(RENDER_NEEDLE, RENDER_NEW);
console.log("OK repere : rendu AdminDataRequests ajoute apres CrmRoadmap");

// ------------------------------------------------------------
// Garde-fous finaux
// ------------------------------------------------------------
if (countSubstring(text, "ShieldCheck") < 1) {
  fail("garde-fou final : ShieldCheck introuvable — verifiez qu'il est bien importe depuis lucide-react dans ce fichier.");
}
if (countSubstring(text, "AdminDataRequests") !== 3) {
  fail(`garde-fou final : attendu 3 occurrences de AdminDataRequests (import + badge usage indirect + rendu), trouve ${countSubstring(text, "AdminDataRequests")}.`);
}
if (countSubstring(text, "rgpd: ShieldCheck,") !== 1) fail("garde-fou final : entree TAB_ICONS rgpd absente ou en double.");
if (countSubstring(text, "rgpdPendingCount") < 3) fail("garde-fou final : etat rgpdPendingCount incomplet.");
if (countSubstring(text, '{tab === "avenir" && <CrmRoadmap />}') !== 1) fail("garde-fou final : rendu avenir a disparu (ne doit pas etre touche).");
if (countSubstring(text, '{tab === "rgpd" && <AdminDataRequests') !== 1) fail("garde-fou final : rendu rgpd absent ou en double.");
console.log("OK garde-fou : import, icone, etat, badge et rendu tous presents, avenir intact");

// ------------------------------------------------------------
// Resultat
// ------------------------------------------------------------
if (text === original) {
  fail("aucune modification produite malgre les controles reussis (cas inattendu).");
}

console.log("");
console.log(`Mode : ${dryRun ? "DRY-RUN" : "APPLY"}`);
console.log("Tous les controles sont conformes.");

if (dryRun) {
  console.log("VERIFICATION SEULE : aucun fichier modifie.");
} else {
  fs.writeFileSync(file, text, "utf8");
  console.log(`Fichier modifie : ${path.relative(process.cwd(), file)}`);
}