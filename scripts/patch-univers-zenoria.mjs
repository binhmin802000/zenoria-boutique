// ZENORIA - Lot 4B-1 (rubrique d'accueil "L'univers Zenoria")
// ============================================================
// Ce script modifie UNIQUEMENT pages/index.js, et seulement si TOUS les
// controles reussissent. Si un seul echoue, AUCUNE ecriture n'est faite
// (tout ou rien).
//
// Chantier :
//   A. Ajoute deux icones (BookOpen, Hand) a l'import lucide-react deja
//      present (ligne contenant "Mail, MessageCircle, Send").
//   B. Insere une nouvelle section <section id="univers-zenoria"> juste
//      avant le commentaire "{/* SAVOIR-FAIRE */}", avec 4 cartes :
//        - Notre histoire   -> window.dispatchEvent(new Event(OPEN_STORY_EVENT))
//          (reprend EXACTEMENT le mecanisme deja utilise par le bouton
//          "Decouvrir notre histoire" du bloc Philosophie : deplie la
//          section ET y fait defiler, au lieu d'un simple scroll qui
//          laisserait la section repliee)
//        - Notre savoir-faire -> scrollToSection("savoir-faire")
//        - Notre philosophie  -> scrollToSection("philosophie")
//        - Le quiz couleurs   -> lien <a href="/quiz">
//      Aucun contenu existant (StorySection, SavoirFaire, Philosophie,
//      Quiz) n'est duplique : cette section ne fait que sommaire/naviguer.
//
// Usage :
//   node scripts/patch-univers-zenoria.mjs --dry-run
//   node scripts/patch-univers-zenoria.mjs --apply
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
// A — Import des icones BookOpen et Hand
// ------------------------------------------------------------
const IMPORT_LINE_NEEDLE = "Mail, MessageCircle, Send";
const importIdx = requireUnique(
  linesContaining(lines, IMPORT_LINE_NEEDLE),
  "import lucide-react (ligne Mail, MessageCircle, Send)",
  IMPORT_LINE_NEEDLE
);
if ((lines[importIdx].match(/Mail, MessageCircle, Send/g) || []).length !== 1) {
  fail("import lucide-react : occurrence multiple sur la meme ligne (cas inattendu).");
}
lines[importIdx] = lines[importIdx].replace(
  "Mail, MessageCircle, Send",
  "Mail, MessageCircle, Send, BookOpen, Hand"
);
console.log("OK repere : import lucide-react (BookOpen, Hand ajoutes)");

// ------------------------------------------------------------
// B — Insertion de la section avant "{/* SAVOIR-FAIRE */}"
// ------------------------------------------------------------
const SAVOIR_FAIRE_COMMENT = "{/* SAVOIR-FAIRE */}";
const sfIdxs = linesContaining(lines, SAVOIR_FAIRE_COMMENT);
const sfIdx = requireUnique(sfIdxs, "commentaire {/* SAVOIR-FAIRE */}", SAVOIR_FAIRE_COMMENT);
const sfIndentMatch = lines[sfIdx].match(/^(\s*)/);
const sfIndent = sfIndentMatch ? sfIndentMatch[1] : "        ";

const sectionLines = [
  `${sfIndent}{/* L'UNIVERS ZENORIA : rubrique de navigation vers Notre histoire, Savoir-faire, Philosophie et le Quiz */}`,
  `${sfIndent}<section id="univers-zenoria" className="max-w-6xl mx-auto px-6 py-16">`,
  `${sfIndent}  <div className="text-center mb-10">`,
  `${sfIndent}    <div className="text-xs tracking-[.3em] text-[#9c7285] uppercase mb-3">Découvrir</div>`,
  `${sfIndent}    <h2 className="font-serif text-4xl">L&apos;univers Zenoria</h2>`,
  `${sfIndent}  </div>`,
  `${sfIndent}  <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">`,
  `${sfIndent}    <button`,
  `${sfIndent}      type="button"`,
  `${sfIndent}      onClick={() => window.dispatchEvent(new Event(OPEN_STORY_EVENT))}`,
  `${sfIndent}      data-testid="univers-card-histoire"`,
  `${sfIndent}      className="text-left rounded-[1.5rem] border border-[#eee2e5] bg-white p-6 hover:shadow-md transition"`,
  `${sfIndent}    >`,
  `${sfIndent}      <BookOpen className="text-[#8f6075] mb-4" size={26} />`,
  `${sfIndent}      <div className="font-serif text-xl mb-1">Notre histoire</div>`,
  `${sfIndent}      <div className="text-sm text-[#70656a]">Une aventure née d&apos;une passion pour les pierres et le sens.</div>`,
  `${sfIndent}    </button>`,
  `${sfIndent}    <button`,
  `${sfIndent}      type="button"`,
  `${sfIndent}      onClick={() => scrollToSection("savoir-faire")}`,
  `${sfIndent}      data-testid="univers-card-savoir-faire"`,
  `${sfIndent}      className="text-left rounded-[1.5rem] border border-[#eee2e5] bg-white p-6 hover:shadow-md transition"`,
  `${sfIndent}    >`,
  `${sfIndent}      <Hand className="text-[#8f6075] mb-4" size={26} />`,
  `${sfIndent}      <div className="font-serif text-xl mb-1">Notre savoir-faire</div>`,
  `${sfIndent}      <div className="text-sm text-[#70656a]">Des bijoux façonnés avec exigence et bienveillance.</div>`,
  `${sfIndent}    </button>`,
  `${sfIndent}    <button`,
  `${sfIndent}      type="button"`,
  `${sfIndent}      onClick={() => scrollToSection("philosophie")}`,
  `${sfIndent}      data-testid="univers-card-philosophie"`,
  `${sfIndent}      className="text-left rounded-[1.5rem] border border-[#eee2e5] bg-white p-6 hover:shadow-md transition"`,
  `${sfIndent}    >`,
  `${sfIndent}      <Gem className="text-[#8f6075] mb-4" size={26} />`,
  `${sfIndent}      <div className="font-serif text-xl mb-1">Notre philosophie</div>`,
  `${sfIndent}      <div className="text-sm text-[#70656a]">Des créations qui vous ressemblent, pour illuminer votre quotidien.</div>`,
  `${sfIndent}    </button>`,
  `${sfIndent}    <a`,
  `${sfIndent}      href="/quiz"`,
  `${sfIndent}      data-testid="univers-card-quiz"`,
  `${sfIndent}      className="text-left block rounded-[1.5rem] border border-[#eee2e5] bg-white p-6 hover:shadow-md transition"`,
  `${sfIndent}    >`,
  `${sfIndent}      <Sparkles className="text-[#8f6075] mb-4" size={26} />`,
  `${sfIndent}      <div className="font-serif text-xl mb-1">Le quiz couleurs</div>`,
  `${sfIndent}      <div className="text-sm text-[#70656a]">Trouvez les pierres qui résonnent avec votre énergie.</div>`,
  `${sfIndent}    </a>`,
  `${sfIndent}  </div>`,
  `${sfIndent}</section>`,
];

lines = [
  ...lines.slice(0, sfIdx),
  ...sectionLines,
  ...lines.slice(sfIdx),
];
console.log("OK repere : section univers-zenoria inseree avant {/* SAVOIR-FAIRE */}");

// ------------------------------------------------------------
// Garde-fous finaux
// ------------------------------------------------------------
let text = lines.join(EOL);

if (countSubstring(text, 'id="univers-zenoria"') !== 1) {
  fail('garde-fou final : attendu 1 occurrence de id="univers-zenoria".');
}
if (countSubstring(text, "BookOpen") < 2) {
  fail("garde-fou final : BookOpen doit apparaitre au moins 2 fois (import + usage).");
}
if (countSubstring(text, "Hand") < 2) {
  fail("garde-fou final : Hand doit apparaitre au moins 2 fois (import + usage).");
}
if (countSubstring(text, SAVOIR_FAIRE_COMMENT) !== 1) {
  fail("garde-fou final : le commentaire {/* SAVOIR-FAIRE */} a disparu ou est en double.");
}
if (countSubstring(text, "window.dispatchEvent(new Event(OPEN_STORY_EVENT))") !== 2) {
  fail(
    "garde-fou final : attendu 2 occurrences de l'appel dispatchEvent(OPEN_STORY_EVENT) " +
    "(le bouton Philosophie existant + la nouvelle carte Notre histoire)."
  );
}
if (countSubstring(text, 'data-testid="univers-card-histoire"') !== 1) {
  fail('garde-fou final : carte "Notre histoire" absente ou en double.');
}
if (countSubstring(text, 'data-testid="univers-card-savoir-faire"') !== 1) {
  fail('garde-fou final : carte "Notre savoir-faire" absente ou en double.');
}
if (countSubstring(text, 'data-testid="univers-card-philosophie"') !== 1) {
  fail('garde-fou final : carte "Notre philosophie" absente ou en double.');
}
if (countSubstring(text, 'data-testid="univers-card-quiz"') !== 1) {
  fail('garde-fou final : carte "Le quiz couleurs" absente ou en double.');
}
console.log("OK garde-fou : section et 4 cartes presentes exactement une fois, icones importees, mecanisme Notre histoire conforme");

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
console.log("  - Import des icones BookOpen et Hand (lucide-react)");
console.log("  - Nouvelle section \"L'univers Zenoria\" (4 cartes : Notre histoire, Savoir-faire, Philosophie, Quiz)");
console.log("  - Placee entre le catalogue et la section Savoir-faire");

if (dryRun) {
  console.log("");
  console.log("VERIFICATION SEULE : aucun fichier modifie.");
} else {
  fs.writeFileSync(file, text, "utf8");
  console.log("");
  console.log(`Fichier modifie : ${path.relative(process.cwd(), file)}`);
}