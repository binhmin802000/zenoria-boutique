// ============================================================
// patch-textes-etape3.mjs : textes du Savoir-faire et de l'accueil modifiables depuis l'admin (étape 3)
//
// À lancer depuis la racine du projet (le dossier « zenoria », celui qui contient package.json), APRÈS avoir extrait
// le zip (lib/siteTexts.js, components/TextLines.js, components/AdminSiteTexts.js, sql/, scripts/) :
//     chcp 65001
//     node scripts/patch-textes-etape3.mjs
//
// Ce que le script fait, et rien d'autre :
//  1. components/SavoirFaire.js : le titre, le paragraphe, les 3 chiffres clés et les 4 étapes viennent des textes du site
//     (admin) ou, à défaut, des textes d'origine. Les icônes et la mise en page ne changent pas.
//  2. pages/index.js : les textes du haut de page, des saisons, de la philosophie et de l'invitation au quiz idem.
//     La page lit la clé « site_texts » avec les autres réglages (étape 2).
//  3. components/AdminSiteMedia.js : ajoute la carte « Textes du site » dans « Contenu du site ».
//
// Sûr :
//  - il vérifie TOUS les repères avant d'écrire quoi que ce soit ; si un seul manque, il n'écrit RIEN ;
//  - il liste TOUS les repères manquants d'un coup, avec l'extrait du fichier autour ;
//  - il COMPARE le texte actuellement dans vos fichiers avec le texte d'origine de lib/siteTexts.js : s'ils diffèrent
//    (par exemple si vous avez modifié un texte à la main), il s'arrête et vous montre la différence, pour ne jamais
//    changer un texte sans vous le dire ;
//  - il conserve les fins de ligne de chaque fichier et peut être relancé sans effet.
// Pour annuler : git restore pages components
// ============================================================
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const P = (...a) => path.join(root, ...a);

function fatal(msg) {
  console.error("\n✗ " + msg + "\n  Aucun fichier n'a été modifié.");
  process.exit(1);
}

const FILES = ["pages/index.js", "components/SavoirFaire.js", "components/AdminSiteMedia.js"];
for (const f of ["lib/siteTexts.js", "components/TextLines.js", "components/AdminSiteTexts.js", "lib/siteSettings.js"]) {
  if (!fs.existsSync(P(...f.split("/")))) fatal(`Fichier introuvable : ${f}. Extrayez d'abord le zip à la racine du projet (dossier « zenoria »), puis relancez.`);
}

// ---- textes d'origine : lus dans lib/siteTexts.js (sans import, donc évaluable tel quel) ----
let TEXT_FIELDS;
let DEFAULTS;
try {
  const src = fs.readFileSync(P("lib", "siteTexts.js"), "utf8").replace(/^export\s+(async\s+function|function|const)/gm, "$1");
  const lib = new Function(src + "\nreturn { TEXT_FIELDS, DEFAULT_TEXTS };")();
  TEXT_FIELDS = lib.TEXT_FIELDS;
  DEFAULTS = lib.DEFAULT_TEXTS;
  if (!Array.isArray(TEXT_FIELDS) || TEXT_FIELDS.length < 20) throw new Error("liste de textes inattendue");
} catch (e) {
  fatal("Je n'arrive pas à lire lib/siteTexts.js : " + e.message);
}
const FIELD = Object.fromEntries(TEXT_FIELDS.map((f) => [f.key, f]));

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
function context(f, needle, before = 6, after = 6) {
  if (!needle) return "";
  const lines = docs[f].text.split("\n");
  const k = lines.findIndex((l) => l.includes(needle));
  if (k < 0) return `    (aucune ligne ne contient « ${needle} »)`;
  const out = [];
  for (let i = Math.max(0, k - before); i <= Math.min(lines.length - 1, k + after); i++) out.push(`    ${String(i + 1).padStart(4)}: ${lines[i]}`);
  return out.join("\n");
}
function problem(f, label, why, hint) {
  problems.push(`✗ ${f} — ${label}\n  ${why}` + (hint ? `\n  Extrait du fichier :\n${context(f, hint)}` : ""));
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const norm = (s) => String(s).replace(/[\s\u00A0\u202F]+/g, " ").replace(/[’‘]/g, "'").trim();

// Texte d'origine -> expression régulière qui le retrouve dans du JSX (mots séparés par des blancs quelconques ;
// l'apostrophe peut être écrite &apos;, ' ou ’ ; un saut de ligne peut être écrit <br />)
function wordsRe(s) {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => esc(w).replace(/'/g, "(?:&apos;|'|’)"))
    .join("\\s+");
}
function needleRe(def, multiline) {
  if (!multiline) return wordsRe(def);
  return def.split("\n").map(wordsRe).join("\\s*<br\\s*\\/?>\\s*");
}

// Remplace le texte d'origine de `key` par son expression React. Le texte est cherché entre « > » et « </ ».
// Si le repère a déjà disparu et que l'expression est là (relance du script), on passe.
function replaceText(f, key, v, opt = {}) {
  const d = docs[f];
  const field = FIELD[key];
  const expr = field.multiline ? `<TextLines text={${v}.${key}} />` : `{${v}.${key}}`;
  if (d.text.includes(`${v}.${key}`)) {
    d.skipped.push(key);
    return;
  }
  const re = new RegExp(`(>[ \\t\\r\\n]*)(${needleRe(field.def, Boolean(field.multiline))})([ \\t\\r\\n]*<\\/)`, "g");
  const n = (d.text.match(re) || []).length;
  if (n === 0) {
    problem(f, `texte « ${key} »`, `je ne retrouve pas le texte d'origine : « ${field.def.replace(/\n/g, " / ")} ». Soit il a été modifié dans ce fichier, soit sa forme est inattendue.`, opt.hint);
    return;
  }
  if (n !== 1) {
    problem(f, `texte « ${key} »`, `le texte d'origine est trouvé ${n} fois (1 attendu).`, opt.hint);
    return;
  }
  d.text = d.text.replace(re, (m, a, t, b) => `${a}${expr}${b}`);
  d.applied.push(key);
}

// ============================================================
// 1. components/SavoirFaire.js
// ============================================================
{
  const f = "components/SavoirFaire.js";
  const d = docs[f];
  if (d.text.includes("STEP_ICONS") && d.text.includes("texts.sf_title")) {
    d.skipped.push("Savoir-faire (déjà modifié)");
  } else {
    // --- les chiffres clés et les étapes d'aujourd'hui : on lit leurs textes, on les compare aux textes d'origine ---
    const stepsBlock = d.text.match(/const STEPS = \[[\s\S]*?\n\];\n/);
    const figBlock = d.text.match(/const KEY_FIGURES = \[[\s\S]*?\n\];\n+/);
    let icons = [];
    if (!stepsBlock || !figBlock) {
      problem(f, "chiffres clés et étapes", "je ne retrouve pas les listes KEY_FIGURES et STEPS en haut du fichier.", "KEY_FIGURES");
    } else {
      const strRe = '("(?:[^"\\\\]|\\\\.)*")';
      const parse = (s) => {
        try {
          return JSON.parse(s);
        } catch (e) {
          return null;
        }
      };
      icons = [...stepsBlock[0].matchAll(/icon:\s*(\w+)/g)].map((m) => m[1]);
      const steps = [...stepsBlock[0].matchAll(new RegExp(`title:\\s*${strRe},\\s*text:\\s*${strRe}`, "g"))].map((m) => [parse(m[1]), parse(m[2])]);
      const figs = [...figBlock[0].matchAll(new RegExp(`value:\\s*${strRe},\\s*label:\\s*${strRe}`, "g"))].map((m) => [parse(m[1]), parse(m[2])]);
      if (icons.length !== 4 || steps.length !== 4 || figs.length !== 3 || steps.some((s) => s[0] === null || s[1] === null) || figs.some((s) => s[0] === null || s[1] === null)) {
        problem(f, "chiffres clés et étapes", `forme inattendue : ${icons.length} icône(s), ${steps.length} étape(s), ${figs.length} chiffre(s) clé(s) (4, 4 et 3 attendus).`, "KEY_FIGURES");
      } else {
        const same = (label, cur, key) => {
          if (norm(cur) !== norm(DEFAULTS[key])) problem(f, `texte « ${key} » (${label})`, `le texte actuel du fichier diffère du texte d'origine de lib/siteTexts.js.\n    fichier : ${cur}\n    origine : ${DEFAULTS[key]}\n  Dites-moi lequel garder, je l'ajuste.`);
        };
        figs.forEach((x, i) => {
          same("chiffre clé, valeur", x[0], `sf_fig${i + 1}_value`);
          same("chiffre clé, libellé", x[1], `sf_fig${i + 1}_label`);
        });
        steps.forEach((x, i) => {
          same("étape, titre", x[0], `sf_step${i + 1}_title`);
          same("étape, texte", x[1], `sf_step${i + 1}_text`);
        });
      }
    }
    // --- le titre et le paragraphe (comparés par la recherche elle-même) ---
    replaceText(f, "sf_title", "texts", { hint: "Notre savoir-faire" });
    replaceText(f, "sf_intro", "texts", { hint: "Chez Zenoria" });

    if (stepsBlock && figBlock && icons.length === 4 && !problems.some((p) => p.startsWith(`✗ ${f}`))) {
      d.text = d.text.replace(figBlock[0], "");
      d.text = d.text.replace(stepsBlock[0], `const STEP_ICONS = [${icons.join(", ")}];\n`);
      d.applied.push("chiffres clés et étapes");
      const edits = [
        ["liste des chiffres clés", "{KEY_FIGURES.map((f) => (", "{figures.map((f, i) => ("],
        ["clé de chaque chiffre clé", "key={f.label}", "key={i}"],
        ["liste des étapes", "{STEPS.map((s, i) => (", "{steps.map((s, i) => ("],
        ["clé de chaque étape", "key={s.title}", "key={i}"],
      ];
      for (const [label, from, to] of edits) {
        const n = d.text.split(from).length - 1;
        if (n !== 1) problem(f, label, `repère « ${from} » trouvé ${n} fois (1 attendu).`, from.slice(0, 14));
        else {
          d.text = d.text.replace(from, () => to);
          d.applied.push(label);
        }
      }
      // propriétés du composant et calcul des listes
      const sigRe = /export default function SavoirFaire\(\{ product, media, accent \}\) \{/;
      if (!sigRe.test(d.text)) problem(f, "propriétés du composant", "je ne retrouve pas « export default function SavoirFaire({ product, media, accent }) { ».", "export default function SavoirFaire");
      else {
        d.text = d.text.replace(sigRe, "export default function SavoirFaire({ product, media, accent, texts = DEFAULT_TEXTS }) {");
        d.applied.push("propriété texts");
      }
      const stateRe = /^([ \t]*)(const \[imgError, setImgError\] = useState\(false\);)[ \t]*$/m;
      if (!stateRe.test(d.text)) problem(f, "calcul des listes", "je ne retrouve pas « const [imgError, setImgError] = useState(false); ».", "imgError");
      else {
        d.text = d.text.replace(
          stateRe,
          (m, i, a) =>
            `${i}${a}\n` +
            `${i}// Textes : ceux de l'admin (Contenu du site > Textes du site), ou à défaut les textes d'origine (lib/siteTexts.js)\n` +
            `${i}const figures = [1, 2, 3].map((n) => ({ value: texts[\`sf_fig\${n}_value\`], label: texts[\`sf_fig\${n}_label\`] }));\n` +
            `${i}const steps = STEP_ICONS.map((icon, i) => ({ icon, title: texts[\`sf_step\${i + 1}_title\`], text: texts[\`sf_step\${i + 1}_text\`] }));`
        );
        d.applied.push("calcul des listes");
      }
      const imp = /^(import RingAnimationSection from "@\/components\/RingAnimationSection";)[ \t]*$/m;
      if (!imp.test(d.text)) problem(f, "imports", "je ne retrouve pas l'import de RingAnimationSection.", "RingAnimationSection");
      else {
        d.text = d.text.replace(imp, (m, a) => `${a}\nimport TextLines from "@/components/TextLines";\nimport { DEFAULT_TEXTS } from "@/lib/siteTexts";`);
        d.applied.push("imports");
      }
      // la phrase « Pour modifier un texte… » n'est plus vraie : on la met à jour (facultatif)
      d.text = d.text.replace(
        /\/\/ Pour modifier un texte, changez simplement les phrases ci-dessous\./,
        "// Les textes se modifient depuis /admin (Contenu du site > Textes du site). Les textes d'origine sont dans lib/siteTexts.js."
      );
    }
  }
}

// ============================================================
// 2. pages/index.js
// ============================================================
{
  const f = "pages/index.js";
  const d = docs[f];
  if (!d.text.includes("SHIPPING_KEY") || !/const shipRow =/.test(d.text) || !/setShippingCfg\(parseShippingSetting\(/.test(d.text)) {
    problem(f, "prérequis", "l'étape 2 (livraison offerte) n'est pas appliquée : je ne retrouve pas SHIPPING_KEY, shipRow ou setShippingCfg. Appliquez d'abord l'étape 2.", "SITE_SETTINGS_TABLE");
  } else {
    const already = d.text.includes("siteTexts.") && d.text.includes("resolveSiteTexts");
    if (!already) {
      if (/\bsiteTexts\b/.test(d.text) || /\bTextLines\b/.test(d.text)) {
        problem(f, "prérequis", "les noms « siteTexts » ou « TextLines » existent déjà dans ce fichier sous une autre forme : je ne veux pas les écraser.", "siteTexts");
      } else {
        // --- imports, état, lecture ---
        const sub = (label, re, repl, hint) => {
          const n = (d.text.match(new RegExp(re.source, "gm")) || []).length;
          if (n !== 1) return problem(f, label, `repère trouvé ${n} fois (1 attendu).`, hint);
          d.text = d.text.replace(re, repl);
          d.applied.push(label);
        };
        sub(
          "imports des textes",
          /^(import \{ SHIPPING_KEY[^\n]*\} from "@\/lib\/shippingSettings";)[ \t]*$/m,
          (m, a) => `${a}\nimport { SITE_TEXTS_KEY, DEFAULT_TEXTS, resolveSiteTexts } from "@/lib/siteTexts";\nimport TextLines from "@/components/TextLines";`,
          "shippingSettings"
        );
        sub(
          "état des textes",
          /^([ \t]*)(const \[shippingCfg, setShippingCfg\] = useState\(DEFAULT_SHIPPING\);[^\n]*)$/m,
          (m, i, a) => `${i}${a}\n${i}const [siteTexts, setSiteTexts] = useState(DEFAULT_TEXTS); // textes du Savoir-faire et de l'accueil (onglet « Contenu du site » de /admin) : textes d'origine tant qu'ils ne sont pas lus`,
          "shippingCfg"
        );
        sub("lecture des textes", /\[SEASON_FX_KEY, SHIPPING_KEY\]/, "[SEASON_FX_KEY, SHIPPING_KEY, SITE_TEXTS_KEY]", "SHIPPING_KEY");
        sub(
          "ligne des textes",
          /^([ \t]*)(const shipRow = settingRows\.find\([^\n]*)$/m,
          (m, i, a) => `${i}${a}\n${i}const textRow = settingRows.find((r) => r.key === SITE_TEXTS_KEY) || null;`,
          "const shipRow"
        );
        sub(
          "application des textes",
          /^([ \t]*)(setShippingCfg\(parseShippingSetting\(shipRow \? shipRow\.value : null\)\);)[ \t]*$/m,
          (m, i, a) => `${i}${a}\n${i}// Textes : si la ligne n'existe pas encore, le site garde ses textes d'origine\n${i}setSiteTexts(resolveSiteTexts(textRow ? textRow.value : null));`,
          "setShippingCfg("
        );
        // --- les textes eux-mêmes ---
        replaceText(f, "hero_tagline", "siteTexts", { hint: "énergie du cristal" });
        replaceText(f, "hero_intro", "siteTexts", { hint: "Trouvez celle qui" });
        replaceText(f, "hero_badge_title", "siteTexts", { hint: "Gem className" });
        replaceText(f, "hero_badge_sub", "siteTexts", { hint: "Cristaux Swarovski" });
        replaceText(f, "seasons_eyebrow", "siteTexts", { hint: "Une palette pour chaque saison" });
        replaceText(f, "seasons_title", "siteTexts", { hint: "Quelle saison vous ressemble" });
        replaceText(f, "seasons_intro", "siteTexts", { hint: "Chaque saison réunit" });
        replaceText(f, "philo_title", "siteTexts", { hint: "Notre philosophie" });
        replaceText(f, "philo_text", "siteTexts", { hint: "Chaque bague Zenoria" });
        replaceText(f, "philo_button", "siteTexts", { hint: "notre histoire" });
        replaceText(f, "quiz_title", "siteTexts", { hint: "Quiz couleurs" });
        replaceText(f, "quiz_text", "siteTexts", { hint: "Choisissez la couleur" });
        // l'étiquette du haut de page : le nombre de collections reste devant le texte
        {
          const field = FIELD.hero_label;
          const re = new RegExp("(\\{products\\.length > 0 \\? `\\$\\{products\\.length\\} collections · ` : \"\"\\})" + wordsRe(field.def), "g");
          const n = (d.text.match(re) || []).length;
          if (d.text.includes("siteTexts.hero_label")) d.skipped.push("hero_label");
          else if (n !== 1) problem(f, "texte « hero_label »", `l'étiquette « ${field.def} », précédée du nombre de collections, est trouvée ${n} fois (1 attendu).`, "4 saisons");
          else {
            d.text = d.text.replace(re, (m, a) => `${a}{siteTexts.hero_label}`);
            d.applied.push("hero_label");
          }
        }
        // la section Savoir-faire reçoit les textes
        {
          const re = /(<SavoirFaire\b[^\n]*?)( \/>)/;
          if (/<SavoirFaire\b[^\n]*texts=\{siteTexts\}/.test(d.text)) d.skipped.push("textes du Savoir-faire");
          else if (!re.test(d.text)) problem(f, "textes du Savoir-faire", "je ne retrouve pas la ligne <SavoirFaire … /> sur une seule ligne.", "<SavoirFaire");
          else {
            d.text = d.text.replace(re, (m, a, b) => `${a} texts={siteTexts}${b}`);
            d.applied.push("textes du Savoir-faire");
          }
        }
      }
    } else d.skipped.push("pages/index.js (déjà modifié)");
  }
}

// ============================================================
// 3. components/AdminSiteMedia.js : la carte « Textes du site »
// ============================================================
{
  const f = "components/AdminSiteMedia.js";
  const d = docs[f];
  if (d.text.includes("AdminSiteTexts")) d.skipped.push("carte « Textes du site »");
  else {
    const impRe = /^(import AdminShipping from "@\/components\/AdminShipping";)[ \t]*$/m;
    const tagRe = /^([ \t]*)(<AdminShipping \/>)[ \t]*$/m;
    if (!impRe.test(d.text) || !tagRe.test(d.text)) {
      problem(f, "carte « Textes du site »", "je ne retrouve pas l'import ou l'emplacement de la carte « Livraison offerte » (étape 2).", "AdminShipping");
    } else {
      d.text = d.text.replace(impRe, (m, a) => `${a}\nimport AdminSiteTexts from "@/components/AdminSiteTexts";`);
      d.text = d.text.replace(tagRe, (m, i, a) => `${i}${a}\n\n${i}{/* TEXTES DU SITE : Savoir-faire et page d'accueil */}\n${i}<AdminSiteTexts />`);
      d.applied.push("carte « Textes du site »");
    }
  }
}

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
