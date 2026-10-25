// ZENORIA - CGV : mise en forme simple (gras, puces, paragraphes)
// ============================================================
// Ce script modifie UNIQUEMENT pages/cgv.js, et seulement si TOUS
// les controles reussissent. Si un seul echoue, AUCUNE ecriture
// n'est faite.
//
// Ajoute une fonction de rendu qui transforme, a l'affichage seulement
// (le texte reste stocke brut en base) :
//   - **texte**        -> <strong>texte</strong>
//   - ligne "- texte"  -> puce de liste
//   - ligne vide       -> nouveau paragraphe (espacement)
//
// Usage :
//   node scripts/patch-cgv-mise-en-forme.mjs --dry-run
//   node scripts/patch-cgv-mise-en-forme.mjs --apply
// ============================================================

import fs from "node:fs";
import path from "node:path";

const apply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run");
if (!apply && !dryRun) {
  console.error("Utilisez --dry-run ou --apply.");
  process.exit(2);
}

const file = path.join(process.cwd(), "pages", "cgv.js");
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

let lines = original.split(/\r\n|\n/);

// ------------------------------------------------------------
// A — Ajoute la fonction renderCgvText() apres formatDateTime()
// ------------------------------------------------------------
const FORMAT_FN_END_NEEDLE = '  });' + EOL + '}';
// On localise la fin precise de formatDateTime via un repere texte unique
const MARKER = "timeZone: \"Europe/Paris\",";
const markerIdxs = [];
lines.forEach((l, i) => { if (l.includes(MARKER)) markerIdxs.push(i); });
if (markerIdxs.length !== 1) {
  fail(`repere formatDateTime : attendu 1 occurrence de ${JSON.stringify(MARKER)}, trouve ${markerIdxs.length}.`);
}
const markerIdx = markerIdxs[0];
// La fonction se termine 2 lignes plus loin : "  });" puis "}"
if (lines[markerIdx + 1].trim() !== "});" || lines[markerIdx + 2].trim() !== "}") {
  fail("structure de formatDateTime() inattendue autour du repere timeZone.");
}
const insertAfterIdx = markerIdx + 2;

const renderFunctionLines = [
  "",
  "// Transforme le texte brut des CGV en JSX simple : **gras**, puces (- ...),",
  "// et paragraphes separes par une ligne vide. Le texte reste stocke brut",
  "// en base ; cette mise en forme n'a lieu qu'a l'affichage.",
  "function renderInline(line) {",
  "  const parts = line.split(/(\\*\\*[^*]+\\*\\*)/g);",
  "  return parts.map((part, i) => {",
  "    if (part.startsWith(\"**\") && part.endsWith(\"**\") && part.length > 4) {",
  "      return <strong key={i}>{part.slice(2, -2)}</strong>;",
  "    }",
  "    return part;",
  "  });",
  "}",
  "",
  "function renderCgvText(text) {",
  "  const paragraphs = text.split(/\\n\\s*\\n/);",
  "  return paragraphs.map((paragraph, pIdx) => {",
  "    const rawLines = paragraph.split(\"\\n\").filter((l) => l.trim() !== \"\");",
  "    const isList = rawLines.length > 0 && rawLines.every((l) => l.trim().startsWith(\"- \"));",
  "    if (isList) {",
  "      return (",
  "        <ul key={pIdx} className=\"list-disc pl-5 space-y-1 mb-5\">",
  "          {rawLines.map((l, i) => (",
  "            <li key={i}>{renderInline(l.trim().slice(2))}</li>",
  "          ))}",
  "        </ul>",
  "      );",
  "    }",
  "    return (",
  "      <p key={pIdx} className=\"mb-5\">",
  "        {rawLines.map((l, i) => (",
  "          <React.Fragment key={i}>",
  "            {i > 0 && <br />}",
  "            {renderInline(l)}",
  "          </React.Fragment>",
  "        ))}",
  "      </p>",
  "    );",
  "  });",
  "}",
];

lines = [
  ...lines.slice(0, insertAfterIdx + 1),
  ...renderFunctionLines,
  ...lines.slice(insertAfterIdx + 1),
];
console.log("OK repere : fonctions renderInline() et renderCgvText() ajoutees");

// ------------------------------------------------------------
// B — Remplace l'affichage brut {text} par renderCgvText(text)
// ------------------------------------------------------------
let text = lines.join(EOL);

const DISPLAY_OLD = `data-testid="cgv-content" className="mt-8 text-[15px] leading-7 text-[#54434c]" style={{ whiteSpace: "pre-wrap" }}>${EOL}            {text}${EOL}          </div>`;
if (countSubstring(text, DISPLAY_OLD) !== 1) {
  fail("bloc d'affichage du texte CGV introuvable sous la forme exacte attendue.");
}
const DISPLAY_NEW = `data-testid="cgv-content" className="mt-8 text-[15px] leading-7 text-[#54434c]">${EOL}            {renderCgvText(text)}${EOL}          </div>`;
text = text.replace(DISPLAY_OLD, DISPLAY_NEW);
console.log("OK repere : affichage du texte CGV bascule vers renderCgvText(text)");

// ------------------------------------------------------------
// Garde-fous finaux
// ------------------------------------------------------------
if (countSubstring(text, "function renderCgvText") !== 1) fail("garde-fou final : renderCgvText absente ou en double.");
if (countSubstring(text, "function renderInline") !== 1) fail("garde-fou final : renderInline absente ou en double.");
if (countSubstring(text, "renderCgvText(text)") !== 2) fail("garde-fou final : attendu exactement 2 occurrences de renderCgvText(text) (declaration + appel).");
if (countSubstring(text, "cgv-empty") !== 1) fail("garde-fou final : le texte de secours (cgv vide) a disparu.");
console.log("OK garde-fou : fonctions presentes une fois, appel branche, texte de secours intact");

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
console.log("  - **texte** -> gras");
console.log("  - ligne \"- texte\" -> puce de liste");
console.log("  - ligne vide -> nouveau paragraphe espace");

if (dryRun) {
  console.log("");
  console.log("VERIFICATION SEULE : aucun fichier modifie.");
} else {
  fs.writeFileSync(file, text, "utf8");
  console.log("");
  console.log(`Fichier modifie : ${path.relative(process.cwd(), file)}`);
}