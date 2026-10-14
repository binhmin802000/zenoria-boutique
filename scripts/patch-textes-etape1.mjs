// ============================================================
// patch-textes-etape1.mjs (version 2) : textes du site, quiz et mannequin (étape 1)
//
// À lancer depuis la racine du projet (le dossier « zenoria », celui qui contient package.json) :
//     chcp 65001
//     node scripts/patch-textes-etape1.mjs
//
// Ce que le script fait, et rien d'autre :
//  1. Accueil : nouvelle phrase d'accueil (version « luxe »), « façonnée(s) à la main » partout où c'était
//     « faite(s) à la main », nouvelle phrase des saisons, titre « Quelle bague vous convient le mieux ? »
//  2. Savoir-faire : « ou perles » retiré, nouvelles phrases de la monture en laiton cuivré et de l'assemblage
//  3. « Rupture de stock » devient « Épuisé » ; le délai de fabrication est fixé à « 30 jours »
//  4. Quiz : la question « Pour affiner » (or ou argent) est retirée, ainsi que la remarque sur la monture du résultat
//  5. Mannequin : sourire doux (version B), partout où il apparaît
//
// Ne touche PAS à : « 100 % fait main », « Fait main / Pièce par pièce », « entièrement réalisée à la main »
// (Savoir-faire), ni au titre de la page du quiz.
//
// Sûr :
//  - il vérifie TOUS les repères avant d'écrire quoi que ce soit ; si un seul manque, il n'écrit RIEN ;
//  - il liste TOUS les repères manquants d'un coup (et l'extrait du fichier autour), pour qu'une seule
//    correction suffise ;
//  - il conserve les fins de ligne de chaque fichier et peut être relancé sans effet.
// Pour annuler : git restore pages components lib
// ============================================================
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const P = (...a) => path.join(root, ...a);

function fatal(msg) {
  console.error("\n✗ " + msg + "\n  Aucun fichier n'a été modifié.");
  process.exit(1);
}

const FILES = [
  "pages/index.js",
  "pages/quiz.js",
  "components/QuizChrome.js",
  "components/QuizResult.js",
  "components/QuizSteps.js",
  "components/Mannequin.js",
  "components/SavoirFaire.js",
  "lib/shopUtils.js",
  "lib/quizOutfits.js",
];

// ---- lecture de tous les fichiers (rien n'est écrit tant que tout n'est pas vérifié) ----
const docs = {};
for (const f of FILES) {
  const p = P(...f.split("/"));
  if (!fs.existsSync(p)) fatal(`Fichier introuvable : ${f}. Lancez la commande depuis le dossier « zenoria » (celui qui contient package.json).`);
  const raw = fs.readFileSync(p, "utf8");
  if (raw.includes("\uFFFD")) fatal(`${f} n'est pas encodé en UTF-8 : je ne le modifie pas pour ne pas abîmer les accents.`);
  docs[f] = { path: p, crlf: raw.includes("\r\n"), text: raw.replace(/\r\n/g, "\n"), applied: [], skipped: [] };
}

const problems = [];
// Extrait du fichier autour des lignes qui contiennent `needle` (pour que je voie la vraie structure)
function context(f, needle, before = 6, after = 5) {
  if (!needle) return "";
  const lines = docs[f].text.split("\n");
  const k = lines.findIndex((l) => l.includes(needle));
  if (k < 0) return `    (aucune ligne ne contient « ${needle} »)`;
  const from = Math.max(0, k - before);
  const to = Math.min(lines.length - 1, k + after);
  const out = [];
  for (let i = from; i <= to; i++) out.push(`    ${String(i + 1).padStart(4)}: ${lines[i]}`);
  return out.join("\n");
}
function problem(f, label, why, hint) {
  problems.push(`✗ ${f} — ${label}\n  ${why}` + (hint ? `\n  Extrait du fichier :\n${context(f, hint)}` : ""));
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const lit = (s) => new RegExp(esc(s));
const isDone = (done, text) => (done ? (typeof done === "function" ? done(text) : done instanceof RegExp ? done.test(text) : text.includes(done)) : false);

// Remplace exactement `count` occurrences (1 par défaut). Si le repère a déjà disparu et que le résultat attendu
// est là (relance du script), on passe. Sinon on note le problème et on continue (rien n'est écrit à la fin).
function sub(f, label, re, repl, opt = {}) {
  const d = docs[f];
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  const n = (d.text.match(g) || []).length;
  const want = opt.count || 1;
  if (n === 0) {
    if (isDone(opt.done, d.text)) d.skipped.push(label);
    else problem(f, label, "repère introuvable : la ligne ne ressemble pas à celle que j'attendais.", opt.hint);
    return;
  }
  if (n !== want) {
    problem(f, label, `repère trouvé ${n} fois (${want} attendu).`, opt.hint);
    return;
  }
  const before = d.text;
  d.text = d.text.replace(g, typeof repl === "function" ? repl : () => repl);
  if (d.text === before) d.skipped.push(label);
  else d.applied.push(label);
}

// ---- retrait d'un bloc JSX, par comptage des accolades ou des <div> (indépendant de la forme exacte du bloc) ----
const count = (s, re) => (s.match(re) || []).length;
const net = (s) => ({ brace: count(s, /\{/g) - count(s, /\}/g), paren: count(s, /\(/g) - count(s, /\)/g), div: count(s, /<div\b/g) - count(s, /<\/div>/g) });
const balanced = (s) => {
  const n = net(s);
  return n.brace === 0 && n.paren === 0 && n.div === 0;
};
function endByBraces(lines, start) {
  let depth = 0, seen = false;
  for (let i = start; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === "{") { depth++; seen = true; }
      else if (ch === "}") depth--;
    }
    if (seen && depth <= 0) return i;
  }
  return -1;
}
function endByDivs(lines, start) {
  let depth = 0, seen = false;
  for (let i = start; i < lines.length; i++) {
    depth += count(lines[i], /<div\b/g) - count(lines[i], /<\/div>/g);
    if (count(lines[i], /<div\b/g)) seen = true;
    if (seen && depth <= 0) return i;
  }
  return -1;
}
const prevNonBlank = (lines, i) => { for (let j = i - 1; j >= 0; j--) if (lines[j].trim()) return lines[j].trim(); return ""; };
const nextNonBlank = (lines, i) => { for (let j = i + 1; j < lines.length; j++) if (lines[j].trim()) return lines[j].trim(); return ""; };

// Retire le bloc JSX dont une ligne contient `marker`. Si ce bloc est dans une condition « {... && ( ... )} »
// placée juste au-dessus, la condition part avec lui.
function removeBlock(f, label, marker, doneCheck) {
  const d = docs[f];
  const lines = d.text.split("\n");
  const k = lines.findIndex((l) => l.includes(marker));
  if (k < 0) {
    if (isDone(doneCheck, d.text)) d.skipped.push(label);
    else problem(f, label, `repère « ${marker} » introuvable.`);
    return;
  }
  let start = k, end = -1;
  // 1) condition « {... && ( » juste au-dessus (les commentaires JSX intercalés sont ignorés) ?
  for (let j = k - 1; j >= Math.max(0, k - 5); j--) {
    const t = lines[j].trim();
    if (!t || /^\{\/\*.*\*\/\}$/.test(t)) continue;
    if (/^\{.*&&\s*\($/.test(t)) {
      const e = endByBraces(lines, j);
      if (e >= k && /^\)\}$/.test(lines[e].trim())) { start = j; end = e; }
    }
    break;
  }
  // 2) sinon, le <div> lui-même
  if (end < 0) {
    if (!/<div\b/.test(lines[k])) {
      problem(f, label, "la ligne repère n'est pas l'ouverture d'un <div> : je ne sais pas où le bloc commence.", marker);
      return;
    }
    end = endByDivs(lines, k);
    if (end < 0) {
      problem(f, label, "je ne trouve pas la fin du bloc.", marker);
      return;
    }
  }
  const seg = lines.slice(start, end + 1).join("\n");
  if (!balanced(seg)) {
    problem(f, label, "le bloc trouvé n'est pas équilibré (accolades, parenthèses ou <div>) : je ne le retire pas pour ne pas casser le fichier.", marker);
    return;
  }
  // le bloc ne doit pas être le seul contenu d'une parenthèse ou d'une condition ternaire
  const before = prevNonBlank(lines.slice(0, start).concat([""]), start);
  const after = nextNonBlank(lines, end);
  if (/\($/.test(before) && /^\)/.test(after)) {
    problem(f, label, "le bloc est le seul contenu d'une parenthèse ou d'une condition : le retirer laisserait un code invalide.", marker);
    return;
  }
  lines.splice(start, end - start + 1);
  d.text = lines.join("\n");
  d.applied.push(label);
}

// Retire une ligne ou un bloc d'accolades commençant par une condition « {(...) && ( »
function removeBraceBlockStartingWith(f, label, startRe, doneCheck) {
  const d = docs[f];
  const lines = d.text.split("\n");
  const k = lines.findIndex((l) => startRe.test(l));
  if (k < 0) {
    if (isDone(doneCheck, d.text)) d.skipped.push(label);
    else problem(f, label, "repère introuvable.");
    return;
  }
  const end = endByBraces(lines, k);
  const seg = end >= 0 ? lines.slice(k, end + 1).join("\n") : "";
  if (end < 0 || !balanced(seg)) {
    problem(f, label, "le bloc n'est pas équilibré : je ne le retire pas.", lines[k].trim().slice(0, 40));
    return;
  }
  lines.splice(k, end - k + 1);
  d.text = lines.join("\n");
  d.applied.push(label);
}

// ============================================================
// 1. pages/index.js : accueil
// ============================================================
{
  const f = "pages/index.js";
  sub(f, "description de la page", lit("Bagues faites à la main en cristaux Swarovski"), "Bagues façonnées à la main en cristaux Swarovski", {
    done: "Bagues façonnées à la main en cristaux Swarovski", hint: "Swarovski, rassemblées",
  });
  sub(f, "bandeau : « façonnées à la main »", lit("Créations faites à la main en cristaux Swarovski"), "Créations façonnées à la main en cristaux Swarovski", {
    done: "Créations façonnées à la main en cristaux Swarovski", hint: "Livraison offerte dès",
  });
  sub(f, "étiquette de l'accueil", lit("Faites à la main"), "Façonnées à la main", { done: "Façonnées à la main", hint: "4 saisons" });
  sub(
    f,
    "phrase d'accueil (version luxe)",
    lit("Des bagues faites à la main, façonnées avec soin en cristaux Swarovski et rassemblées en quatre saisons de couleurs. Trouvez celle qui s&apos;accorde à votre teint, à vos yeux et à vos cheveux."),
    "Façonnées à la main avec exigence et précision, nos bagues en cristaux Swarovski suivent les quatre saisons pour sublimer celles qui les portent. Trouvez celle qui s&apos;accorde à votre teint, à vos yeux et à vos cheveux.",
    { done: "nos bagues en cristaux Swarovski suivent les quatre saisons pour sublimer celles qui les portent", hint: "Des bagues faites à la main" }
  );
  sub(f, "vignette « Façonnée à la main »", lit("Faite à la main"), "Façonnée à la main", { done: "Façonnée à la main", hint: "Cristaux Swarovski</div>" });
  sub(
    f,
    "phrase « Quelle saison vous ressemble ? »",
    lit("Chaque saison réunit des bagues dont les couleurs s&apos;accordent entre elles, et avec votre carnation."),
    "Chaque saison réunit des bagues dont les teintes se répondent, pour révéler votre carnation.",
    { done: "Chaque saison réunit des bagues dont les teintes se répondent, pour révéler votre carnation.", hint: "Chaque saison réunit" }
  );
  sub(f, "titre de l'invitation au quiz", lit("Quelle bague vous va le mieux"), "Quelle bague vous convient le mieux", { done: "Quelle bague vous convient le mieux", hint: "Quelle bague" });
}

// ============================================================
// 2. pages/quiz.js et components/QuizChrome.js
// ============================================================
{
  const f = "pages/quiz.js";
  sub(f, "description de la page du quiz", lit("bagues faites à la main"), "bagues façonnées à la main", { done: "bagues façonnées à la main", hint: "meta name=\"description\"" });
  sub(f, "question or / argent : propriété onMetal", lit(" onMetal={chooseMetal}"), "", { done: (t) => !t.includes("onMetal={chooseMetal}"), hint: "<QuizSteps" });
  sub(f, "question or / argent : explication", lit(" showWhy={showWhy} onToggleWhy={() => setShowWhy(!showWhy)}"), "", {
    done: (t) => !t.includes("onToggleWhy={() => setShowWhy(!showWhy)}"), hint: "<QuizSteps",
  });
}
sub("components/QuizChrome.js", "bandeau du quiz : « façonnées à la main »", lit("Créations faites à la main en cristaux Swarovski"), "Créations façonnées à la main en cristaux Swarovski", {
  done: "Créations façonnées à la main en cristaux Swarovski", hint: "Livraison offerte dès",
});

// ============================================================
// 3. components/QuizSteps.js : la question « Pour affiner » disparaît entièrement
// ============================================================
{
  const f = "components/QuizSteps.js";
  // le bloc d'abord (on a besoin de savoir ensuite si l'icône « Info » sert encore ailleurs)
  removeBlock(f, "bloc « Pour affiner » (or ou argent)", 'data-testid="quiz-metal"', (t) => !t.includes('data-testid="quiz-metal"'));
  sub(f, "liste des choix or / argent", /const METAL_CHOICES = \[[\s\S]*?\n\];\n\n?/, "", { done: (t) => !t.includes("METAL_CHOICES"), hint: "METAL_CHOICES" });
  sub(f, "propriétés du composant", lit("{ profile, step, onPick, onMetal, onBack, onNext, showWhy, onToggleWhy }"), "{ profile, step, onPick, onBack, onNext }", {
    done: "{ profile, step, onPick, onBack, onNext }", hint: "export default function QuizSteps",
  });
  // l'icône « Info » n'est retirée de l'import que si plus rien ne l'utilise
  const d = docs[f];
  const imp = d.text.match(/import \{([^}]*)\} from "lucide-react";/);
  if (imp && /\bInfo\b/.test(imp[1])) {
    const without = d.text.replace(imp[0], "");
    if (!/\bInfo\b/.test(without)) {
      const names = imp[1].split(",").map((s) => s.trim()).filter((s) => s && s !== "Info");
      d.text = d.text.replace(imp[0], names.length ? `import { ${names.join(", ")} } from "lucide-react";` : "");
      d.applied.push("import inutile (Info)");
    }
  }
  // plus aucune référence à l'ancienne question ne doit rester dans ce fichier
  const rest = d.text.split("\n").map((l, i) => [i + 1, l]).filter(([, l]) => /onMetal|showWhy|onToggleWhy|METAL_CHOICES|profile\.metal|quiz-metal/.test(l));
  if (rest.length && !problems.some((p) => p.includes(f))) problem(f, "références restantes à l'ancienne question", "ces lignes utilisent encore la question retirée :\n" + rest.map(([n, l]) => `    ${String(n).padStart(4)}: ${l}`).join("\n"));
}

// ============================================================
// 4. components/QuizResult.js : plus de choix de métal, plus de remarque sur la monture
// ============================================================
{
  const f = "components/QuizResult.js";
  removeBraceBlockStartingWith(f, "pastille « Métal » de « Vos choix »", /\{\(profile\.metal === 1 \|\| profile\.metal === -1\) && \(/, (t) => !t.includes("profile.metal === 1"));
  removeBlock(f, "remarque sur la monture", 'data-testid="quiz-metal-remark"', (t) => !t.includes('data-testid="quiz-metal-remark"'));
  sub(f, "import inutile", lit("SEASON_WHY, metalRemark, traitLabels"), "SEASON_WHY, traitLabels", { done: (t) => !t.includes("metalRemark"), hint: "colorEngine" });
  sub(f, "« Façonnée à la main, à l'image près »", lit("Faite à la main, à l&apos;image près."), "Façonnée à la main, à l&apos;image près.", { done: "Façonnée à la main, à l&apos;image près.", hint: "à l&apos;image près" });
  const d = docs[f];
  const rest = d.text.split("\n").map((l, i) => [i + 1, l]).filter(([, l]) => /metalRemark|profile\.metal/.test(l));
  if (rest.length && !problems.some((p) => p.includes(f))) problem(f, "références restantes à la remarque sur la monture", "ces lignes l'utilisent encore :\n" + rest.map(([n, l]) => `    ${String(n).padStart(4)}: ${l}`).join("\n"));
}

// ============================================================
// 5. components/Mannequin.js : sourire doux (version B)
//    Seuls changent la bouche, les joues et le bas des yeux. Les couleurs restent celles de la palette.
// ============================================================
{
  const f = "components/Mannequin.js";
  sub(f, "joue gauche", lit('opacity=".38" cx="150" cy="248" rx="20" ry="12"'), 'opacity=".5" cx="149" cy="243" rx="22" ry="13"', { done: 'cx="149" cy="243" rx="22" ry="13"', hint: 'cx="150" cy="248"' });
  sub(f, "joue droite", lit('opacity=".38" cx="250" cy="248" rx="20" ry="12"'), 'opacity=".5" cx="251" cy="243" rx="22" ry="13"', { done: 'cx="251" cy="243" rx="22" ry="13"', hint: 'cx="250" cy="248"' });
  sub(f, "œil gauche (forme, 2 occurrences)", lit("Q161 221 142 207Z"), "Q161 215.5 142 207Z", { count: 2, done: "Q161 215.5 142 207Z", hint: "Q161 221 142 207Z" });
  sub(f, "œil droit (forme, 2 occurrences)", lit("Q239 221 220 207Z"), "Q239 215.5 220 207Z", { count: 2, done: "Q239 215.5 220 207Z", hint: "Q239 221 220 207Z" });
  sub(f, "paupière basse gauche", lit("M146 213 Q161 222 176 213"), "M146 208.6 Q161 217.6 176 208.6", { done: "M146 208.6 Q161 217.6 176 208.6", hint: "M146 213" });
  sub(f, "paupière basse droite", lit("M224 213 Q239 222 254 213"), "M224 208.6 Q239 217.6 254 208.6", { done: "M224 208.6 Q239 217.6 254 208.6", hint: "M224 213" });
  sub(
    f,
    "bouche (lèvres)",
    /^([ \t]*)<path ([^\n]*?)d="M175 288 Q187 280 200 285 Q213 280 225 288 Q212 304 200 305 Q188 304 175 288Z"([^\n]*?)\/>[ \t]*$/m,
    (m, i, a, b) =>
      `${i}<path ${a}d="M171 284 Q186 277 200 281 Q214 277 229 284 Q200 299 171 284Z"${b}/>\n` +
      `${i}<path ${a}opacity=".92" d="M174 287 Q200 302 226 287 Q215 306 200 307 Q185 306 174 287Z"${b}/>`,
    { done: "M171 284 Q186 277 200 281", hint: "M175 288 Q187 280" }
  );
  sub(
    f,
    "bouche (ligne du sourire et petits plis)",
    /^([ \t]*)<path d="M175 288 Q200 294 225 288" ([^\n]*?)\/>[ \t]*$/m,
    (m, i, rest) =>
      `${i}<path d="M171 284 Q200 299 229 284" fill="none" stroke="#000" strokeOpacity=".28" strokeWidth="1.8" strokeLinecap="round"/>\n` +
      `${i}<path d="M168 280 Q165 285 170 290" fill="none" stroke="#000" strokeOpacity=".14" strokeWidth="1.6" strokeLinecap="round"/>\n` +
      `${i}<path d="M232 280 Q235 285 230 290" fill="none" stroke="#000" strokeOpacity=".14" strokeWidth="1.6" strokeLinecap="round"/>`,
    { done: "M171 284 Q200 299 229 284", hint: "M175 288 Q200 294" }
  );
}

// ============================================================
// 6. components/SavoirFaire.js : « ou perles » retiré, phrases de la monture et de l'assemblage
// ============================================================
{
  const f = "components/SavoirFaire.js";
  sub(f, "commentaire : faite → façonnée", lit("bagues entièrement faites à la main"), "bagues entièrement façonnées à la main", { done: "bagues entièrement façonnées à la main", hint: "bagues entièrement" });
  sub(f, "commentaire : ou perles", lit("50 mini cristaux (ou perles) Swarovski par bague"), "50 mini cristaux Swarovski par bague", { done: "50 mini cristaux Swarovski par bague", hint: "ou perles" });
  sub(f, "étape 01 : ou perles", lit("les mini cristaux Swarovski, ou perles, sont choisis"), "les mini cristaux Swarovski sont choisis", { done: "les mini cristaux Swarovski sont choisis", hint: "Le choix des couleurs" });
  sub(
    f,
    "étape 03 : l'assemblage à la main",
    lit("Les 50 mini cristaux Swarovski, ou perles, sont superposés puis liés grâce à un fil de nylon, un geste réalisé entièrement à la main."),
    "Superposés puis liés par un fil de nylon, les 50 mini cristaux Swarovski prennent forme entre nos mains, avec la précision et l'exigence que demande chaque bague.",
    { done: "les 50 mini cristaux Swarovski prennent forme entre nos mains", hint: "fil de nylon" }
  );
  sub(
    f,
    "étape 04 : la monture en laiton cuivré",
    /L['’]ensemble est posé sur une bague en laiton de couleur cuivre, qui encadre la création\./,
    "Les cristaux reposent sur une monture en laiton aux reflets cuivrés, traitée d'un vernis spécial pour métaux, qui protège la peau et encadre la création.",
    { done: "Les cristaux reposent sur une monture en laiton aux reflets cuivrés", hint: "laiton" }
  );
  sub(f, "paragraphe : ou perles", lit("Swarovski, ou perles, sont assemblés"), "Swarovski sont assemblés", { done: "Swarovski sont assemblés", hint: "assemblés autour" });
}

// ============================================================
// 7. lib/shopUtils.js : « Épuisé » et délai de 30 jours ; lib/quizOutfits.js : « façonnée »
// ============================================================
{
  const f = "lib/shopUtils.js";
  sub(f, "libellé « Épuisé »", lit('label: "Rupture de stock"'), 'label: "Épuisé"', { done: 'label: "Épuisé"', hint: "Rupture de stock" });
  sub(f, "délai de fabrication : 30 jours", /(BACKORDER_LEAD_TIME\s*=\s*)(["'`])[^"'`\n]*\2/, (m, a, q) => `${a}${q}30 jours${q}`, {
    done: /BACKORDER_LEAD_TIME\s*=\s*["'`]30 jours["'`]/, hint: "BACKORDER_LEAD_TIME",
  });
}
sub("lib/quizOutfits.js", "occasion « Anniversaire » : façonnée", lit("la touche faite à la main"), "la touche façonnée à la main", { done: "la touche façonnée à la main", hint: "Anniversaire" });

// ============================================================
// Bilan : on n'écrit RIEN s'il reste un seul repère manquant
// ============================================================
if (problems.length) {
  console.error(`\n✗ ${problems.length} repère(s) à adapter — aucun fichier n'a été modifié.\n`);
  console.error(problems.join("\n\n"));
  console.error("\nCopiez-moi TOUT ce message : il contient les extraits des fichiers dont j'ai besoin pour tout corriger en une fois.");
  process.exit(1);
}
let nWritten = 0;
for (const f of FILES) {
  const d = docs[f];
  if (d.applied.length === 0) {
    console.log(`= ${f} : déjà à jour`);
    continue;
  }
  fs.writeFileSync(d.path, d.crlf ? d.text.replace(/\n/g, "\r\n") : d.text, "utf8");
  nWritten++;
  console.log(`✓ ${f} : ${d.applied.length} modification(s)`);
}
console.log(nWritten ? `\nTerminé : ${nWritten} fichier(s) modifié(s). Étape suivante : git diff --stat, puis npm run build.` : "\nRien à modifier.");
