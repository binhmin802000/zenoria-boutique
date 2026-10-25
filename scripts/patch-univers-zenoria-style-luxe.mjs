// ZENORIA - Lot 4B-1 (style luxe des 4 cartes "L'univers Zenoria") - VERSION DIAGNOSTIC
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

function debugCounts(text, label) {
  console.log(
    `  DEBUG ${label} -> histoire:`, countSubstring(text, 'data-testid="univers-card-histoire"'),
    "| savoir-faire:", countSubstring(text, 'data-testid="univers-card-savoir-faire"'),
    "| philosophie:", countSubstring(text, 'data-testid="univers-card-philosophie"'),
    "| quiz:", countSubstring(text, 'data-testid="univers-card-quiz"')
  );
}

if (countSubstring(original, 'id="univers-zenoria"') !== 1) {
  fail(
    'section univers-zenoria introuvable (attendu 1 occurrence de id="univers-zenoria"). ' +
    "Ce script suppose que le chantier precedent (4 cartes basiques) est deja applique."
  );
}
console.log("OK prerequis : section univers-zenoria presente");
debugCounts(original, "AVANT TOUT (original)");

function replaceBlockByTestId(text, testId, buildNewBlock, label) {
  const marker = `data-testid="${testId}"`;
  const count = countSubstring(text, marker);
  if (count !== 1) {
    fail(`${label} : attendu 1 occurrence de ${JSON.stringify(marker)}, trouve ${count}.`);
  }
  const markerIdx = text.indexOf(marker);
  const beforeMarker = text.slice(0, markerIdx);
  const tagStart = beforeMarker.lastIndexOf("<button");
  const tagStartA = beforeMarker.lastIndexOf("<a");
  const realStart = Math.max(tagStart, tagStartA);
  if (realStart === -1) {
    fail(`${label} : balise ouvrante <button ou <a introuvable avant ${marker}.`);
  }
  const isButton = tagStart > tagStartA;
  const closeTag = isButton ? "</button>" : "</a>";
  const closeIdx = text.indexOf(closeTag, markerIdx);
  if (closeIdx === -1) {
    fail(`${label} : balise fermante ${closeTag} introuvable apres ${marker}.`);
  }
  const blockEnd = closeIdx + closeTag.length;
  const indentMatch = text.slice(0, realStart).match(/\n(\s*)$/);
  const indent = indentMatch ? indentMatch[1] : "            ";
  console.log(`  -> ${label} : realStart=${realStart}, blockEnd=${blockEnd}, isButton=${isButton}, closeTag=${closeTag}`);
  const newBlock = buildNewBlock(indent);
  console.log(`OK repere : ${label} (bloc localise et remplace)`);
  return text.slice(0, realStart) + newBlock + text.slice(blockEnd);
}

let text = original;

text = replaceBlockByTestId(text, "univers-card-histoire", (indent) => [
  `<button`,
  `${indent}  type="button"`,
  `${indent}  onClick={() => window.dispatchEvent(new Event(OPEN_STORY_EVENT))}`,
  `${indent}  data-testid="univers-card-histoire"`,
  `${indent}  className="relative text-left rounded-[1.5rem] bg-[#3b2b39] p-6 hover:shadow-lg transition overflow-hidden"`,
  `${indent}>`,
  `${indent}  <BookOpen className="text-white mb-4" size={26} />`,
  `${indent}  <div className="font-serif text-xl mb-1 text-[#c9a15f]">Notre histoire</div>`,
  `${indent}  <div className="text-sm text-white/70">Une aventure née d&apos;une passion pour les pierres et le sens.</div>`,
  `${indent}  <ArrowRight size={16} className="absolute right-5 bottom-5 text-[#c9a15f]" />`,
  `${indent}</button>`,
].join(EOL), "carte Notre histoire");
debugCounts(text, "apres histoire");

text = replaceBlockByTestId(text, "univers-card-savoir-faire", (indent) => [
  `<button`,
  `${indent}  type="button"`,
  `${indent}  onClick={() => scrollToSection("savoir-faire")}`,
  `${indent}  data-testid="univers-card-savoir-faire"`,
  `${indent}  className="relative text-left rounded-[1.5rem] bg-[#f5edf1] p-6 hover:shadow-lg transition overflow-hidden"`,
  `${indent}>`,
  `${indent}  <Hand className="text-[#412f3b] mb-4" size={26} />`,
  `${indent}  <div className="font-serif text-xl mb-1 text-[#412f3b]">Notre savoir-faire</div>`,
  `${indent}  <div className="text-sm text-[#70656a]">Des bijoux façonnés avec exigence et bienveillance.</div>`,
  `${indent}  <ArrowRight size={16} className="absolute right-5 bottom-5 text-[#8f6075]" />`,
  `${indent}</button>`,
].join(EOL), "carte Notre savoir-faire");
debugCounts(text, "apres savoir-faire");

text = replaceBlockByTestId(text, "univers-card-philosophie", (indent) => [
  `<button`,
  `${indent}  type="button"`,
  `${indent}  onClick={() => scrollToSection("philosophie")}`,
  `${indent}  data-testid="univers-card-philosophie"`,
  `${indent}  className="relative text-left rounded-[1.5rem] bg-[#8f6075] p-6 hover:shadow-lg transition overflow-hidden"`,
  `${indent}>`,
  `${indent}  <Gem className="text-white mb-4" size={26} />`,
  `${indent}  <div className="font-serif text-xl mb-1 text-white">Notre philosophie</div>`,
  `${indent}  <div className="text-sm text-white/70">Des créations qui vous ressemblent, pour illuminer votre quotidien.</div>`,
  `${indent}  <ArrowRight size={16} className="absolute right-5 bottom-5 text-white" />`,
  `${indent}</button>`,
].join(EOL), "carte Notre philosophie");
debugCounts(text, "apres philosophie");

text = replaceBlockByTestId(text, "univers-card-quiz", (indent) => [
  `<a`,
  `${indent}  href="/quiz"`,
  `${indent}  data-testid="univers-card-quiz"`,
  `${indent}  className="relative text-left block rounded-[1.5rem] bg-[#fbf8f4] p-6 hover:shadow-lg transition overflow-hidden border border-[#eee2e5]"`,
  `${indent}>`,
  `${indent}  <Sparkles className="text-[#412f3b] mb-4" size={26} />`,
  `${indent}  <div className="font-serif text-xl mb-1 text-[#412f3b]">Le quiz couleurs</div>`,
  `${indent}  <div className="text-sm text-[#70656a]">Trouvez les pierres qui résonnent avec votre énergie.</div>`,
  `${indent}  <ArrowRight size={16} className="absolute right-5 bottom-5 text-[#8f6075]" />`,
  `${indent}</a>`,
].join(EOL), "carte Le quiz couleurs");
debugCounts(text, "apres quiz (FINAL)");

if (countSubstring(text, 'data-testid="univers-card-histoire"') !== 1) fail("garde-fou final : carte histoire absente ou en double.");
if (countSubstring(text, 'data-testid="univers-card-savoir-faire"') !== 1) fail("garde-fou final : carte savoir-faire absente ou en double.");
if (countSubstring(text, 'data-testid="univers-card-philosophie"') !== 1) fail("garde-fou final : carte philosophie absente ou en double.");
if (countSubstring(text, 'data-testid="univers-card-quiz"') !== 1) fail("garde-fou final : carte quiz absente ou en double.");
console.log("OK garde-fou : 4 cartes presentes");

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