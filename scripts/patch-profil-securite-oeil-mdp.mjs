// ZENORIA - Ajout icone oeil pour afficher/masquer les mots de passe
// ============================================================
import fs from "node:fs";
import path from "node:path";

const apply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run");
if (!apply && !dryRun) {
  console.error("Utilisez --dry-run ou --apply.");
  process.exit(2);
}

const file = path.join(process.cwd(), "components", "AccountProfileSection.js");
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
// A — Import des icones oeil
// ------------------------------------------------------------
const IMPORT_NEEDLE = 'import { KeyRound, LogOut } from "lucide-react";';
const importIdx = requireUnique(linesContaining(lines, IMPORT_NEEDLE), "import KeyRound/LogOut", IMPORT_NEEDLE);
lines[importIdx] = 'import { KeyRound, LogOut, Eye, EyeOff } from "lucide-react";';
console.log("OK repere : import des icones Eye/EyeOff");

// ------------------------------------------------------------
// B — Etats de visibilite, juste apres confirmPassword
// ------------------------------------------------------------
const CONFIRM_STATE_NEEDLE = 'const [confirmPassword, setConfirmPassword] = useState("");';
const confirmStateIdx = requireUnique(linesContaining(lines, CONFIRM_STATE_NEEDLE), "etat confirmPassword", CONFIRM_STATE_NEEDLE);
lines = [
  ...lines.slice(0, confirmStateIdx + 1),
  "  const [showNewPassword, setShowNewPassword] = useState(false);",
  "  const [showConfirmPassword, setShowConfirmPassword] = useState(false);",
  ...lines.slice(confirmStateIdx + 1),
];
console.log("OK repere : etats showNewPassword/showConfirmPassword ajoutes");

// ------------------------------------------------------------
// C — Champ "nouveau mot de passe" : localise par data-testid, on
// remonte jusqu'au <input ouvrant et on descend jusqu'a la fermeture
// />, peu importe si elle est sur sa propre ligne ou collee.
// ------------------------------------------------------------
function wrapInputWithEye(lines, testId, stateVar, setterVar, label) {
  const marker = `data-testid="${testId}"`;
  const markerIdxs = linesContaining(lines, marker);
  const markerIdx = requireUnique(markerIdxs, `${label} : ligne data-testid`, marker);

  // Remonte jusqu'a la ligne "<input"
  let openIdx = -1;
  for (let i = markerIdx; i >= Math.max(0, markerIdx - 6); i--) {
    if (lines[i].trim() === "<input") { openIdx = i; break; }
  }
  if (openIdx === -1) fail(`${label} : ligne "<input" introuvable avant ${marker}.`);

  // Descend jusqu'a la ligne qui contient la fermeture "/>"
  let closeIdx = -1;
  for (let i = markerIdx; i < Math.min(lines.length, markerIdx + 6); i++) {
    if (lines[i].includes("/>")) { closeIdx = i; break; }
  }
  if (closeIdx === -1) fail(`${label} : fermeture "/>" introuvable apres ${marker}.`);

  const openIndentMatch = lines[openIdx].match(/^(\s*)/);
  const openIndent = openIndentMatch ? openIndentMatch[1] : "          ";
  const innerIndent = openIndent + "  ";

  // Reconstruit le bloc original (pour verification de contenu attendu)
  const originalBlock = lines.slice(openIdx, closeIdx + 1).join(" ");
  if (!originalBlock.includes('type="password"') || !originalBlock.includes("autoComplete=\"new-password\"")) {
    fail(`${label} : contenu inattendu dans le bloc repere (type=password / autoComplete absents).`);
  }

  // Reconstruit chaque ligne interieure avec la bonne indentation et
  // le type dynamique, en gardant les autres lignes identiques.
  const innerLines = lines.slice(openIdx + 1, closeIdx).map((l) => innerIndent + l.trim());
  const typeLineIdx = innerLines.findIndex((l) => l.includes('type="password"'));
  if (typeLineIdx === -1) fail(`${label} : ligne type="password" introuvable dans le bloc interieur.`);
  innerLines[typeLineIdx] = `${innerIndent}type={${stateVar} ? "text" : "password"}`;

  // Ajuste la classe pour laisser de la place a l'icone (pr-10)
  const classLineIdx = innerLines.findIndex((l) => l.includes("className=") && l.includes("px-3"));
  if (classLineIdx !== -1 && !innerLines[classLineIdx].includes("pr-10")) {
    innerLines[classLineIdx] = innerLines[classLineIdx].replace("px-3 h-10", "px-3 pr-10 h-10");
  }

  const newBlock = [
    `${openIndent}<div className="relative">`,
    `${openIndent}  <input`,
    ...innerLines,
    `${openIndent}  />`,
    `${openIndent}  <button`,
    `${innerIndent}  type="button"`,
    `${innerIndent}  onClick={() => ${setterVar}((v) => !v)}`,
    `${innerIndent}  data-testid="toggle-${testId}-visibility"`,
    `${innerIndent}  aria-label={${stateVar} ? "Masquer le mot de passe" : "Afficher le mot de passe"}`,
    `${innerIndent}  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8b737e]"`,
    `${openIndent}  >`,
    `${innerIndent}  {${stateVar} ? <EyeOff size={16} /> : <Eye size={16} />}`,
    `${openIndent}  </button>`,
    `${openIndent}</div>`,
  ];

  console.log(`OK repere : ${label} (bloc lignes ${openIdx + 1} a ${closeIdx + 1} enveloppe)`);
  return [...lines.slice(0, openIdx), ...newBlock, ...lines.slice(closeIdx + 1)];
}

lines = wrapInputWithEye(lines, "new-password-input", "showNewPassword", "setShowNewPassword", "champ nouveau mot de passe");
lines = wrapInputWithEye(lines, "confirm-password-input", "showConfirmPassword", "setShowConfirmPassword", "champ confirmation");

// ------------------------------------------------------------
// Garde-fous finaux
// ------------------------------------------------------------
let text = lines.join(EOL);

if (countSubstring(text, "Eye") < 2) fail("garde-fou final : icone Eye absente ou incomplete.");
if (countSubstring(text, "EyeOff") < 2) fail("garde-fou final : icone EyeOff absente ou incomplete.");
if (countSubstring(text, 'data-testid="new-password-input"') !== 1) fail("garde-fou final : champ nouveau mot de passe disparu ou en double.");
if (countSubstring(text, 'data-testid="confirm-password-input"') !== 1) fail("garde-fou final : champ confirmation disparu ou en double.");
if (countSubstring(text, 'data-testid="toggle-new-password-input-visibility"') !== 1) fail("garde-fou final : bouton oeil (nouveau) absent ou en double.");
if (countSubstring(text, 'data-testid="toggle-confirm-password-input-visibility"') !== 1) fail("garde-fou final : bouton oeil (confirmation) absent ou en double.");
if (countSubstring(text, "changePassword") < 1) fail("garde-fou final : la fonction changePassword a disparu.");

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