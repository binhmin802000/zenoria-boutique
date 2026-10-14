// ============================================================
// patch-livraison-etape2.mjs : réglage de la livraison offerte (étape 2)
//
// À lancer depuis la racine du projet (le dossier « zenoria », celui qui contient package.json), APRÈS avoir extrait
// le zip (lib/shippingSettings.js, components/AdminShipping.js, sql/, scripts/) :
//     chcp 65001
//     node scripts/patch-livraison-etape2.mjs
//
// Ce que le script fait, et rien d'autre :
//  1. pages/index.js : le seuil et l'interrupteur sont lus dans la base (clé « shipping ») ; le bandeau, la barre de
//     progression, la phrase du panier et le calcul de la livraison utilisent ce réglage. La constante
//     FREE_SHIPPING_THRESHOLD disparaît. Les codes promo ne sont pas touchés.
//  2. components/QuizChrome.js et pages/quiz.js : le bandeau du quiz lit le même réglage.
//  3. components/AdminSiteMedia.js : ajoute la carte « Livraison offerte » dans « Contenu du site ».
//  4. pages/quiz.js : retire les restes de la question « Pour affiner » (chooseMetal, showWhy), sans conséquence si
//     leur forme est différente.
//
// Sûr :
//  - il vérifie TOUS les repères avant d'écrire quoi que ce soit ; si un seul manque, il n'écrit RIEN ;
//  - il liste TOUS les repères manquants d'un coup, avec l'extrait du fichier autour ;
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

const FILES = ["pages/index.js", "pages/quiz.js", "components/QuizChrome.js", "components/AdminSiteMedia.js"];
for (const f of ["lib/shippingSettings.js", "components/AdminShipping.js", "lib/siteSettings.js"]) {
  if (!fs.existsSync(P(...f.split("/")))) fatal(`Fichier introuvable : ${f}. Extrayez d'abord le zip à la racine du projet (dossier « zenoria »), puis relancez.`);
}

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
const notes = [];
const count = (s, re) => (s.match(re) || []).length;
function context(f, needle, before = 6, after = 5) {
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
const note = (f, label, why) => notes.push(`• ${f} — ${label} : ${why}`);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const lit = (s) => new RegExp(esc(s));
const isDone = (done, text) => (done ? (typeof done === "function" ? done(text) : done instanceof RegExp ? done.test(text) : text.includes(done)) : false);

// Remplace exactement `count` occurrences (1 par défaut). Si le repère a déjà disparu et que le résultat attendu est là
// (relance du script), on passe. Sinon problème (ou simple note si `optional`).
function sub(f, label, re, repl, opt = {}) {
  const d = docs[f];
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  const n = (d.text.match(g) || []).length;
  const want = opt.count || 1;
  const bad = (why) => (opt.optional ? note(f, label, why + " (ignoré, sans conséquence)") : problem(f, label, why, opt.hint));
  // déjà fait (relance du script) : on ne touche à rien, même si le repère d'origine est encore là (un import, par exemple)
  if (isDone(opt.done, d.text)) {
    d.skipped.push(label);
    return;
  }
  if (n === 0) {
    if (isDone(opt.done, d.text)) d.skipped.push(label);
    else bad("repère introuvable : la ligne ne ressemble pas à celle que j'attendais.");
    return;
  }
  if (n !== want) return bad(`repère trouvé ${n} fois (${want} attendu).`);
  const before = d.text;
  d.text = d.text.replace(g, typeof repl === "function" ? repl : () => repl);
  if (d.text === before) d.skipped.push(label);
  else d.applied.push(label);
}

// ============================================================
// 1. pages/index.js
// ============================================================
{
  const f = "pages/index.js";
  sub(
    f,
    "import du réglage de livraison",
    /^(import \{ SITE_SETTINGS_TABLE[^\n]*\} from "@\/lib\/siteSettings";)[ \t]*$/m,
    (m, a) => `${a}\nimport { SHIPPING_KEY, DEFAULT_SHIPPING, parseShippingSetting, qualifiesForFreeShipping, shippingStripText } from "@/lib/shippingSettings";`,
    { done: 'from "@/lib/shippingSettings"', hint: "@/lib/siteSettings" }
  );
  sub(
    f,
    "constante FREE_SHIPPING_THRESHOLD retirée",
    /^[ \t]*const FREE_SHIPPING_THRESHOLD = \d+;[^\n]*$/m,
    "// Le seuil de livraison offerte et son interrupteur se règlent dans l'admin (Contenu du site) : voir lib/shippingSettings.js",
    { done: "voir lib/shippingSettings.js", hint: "FREE_SHIPPING_THRESHOLD" }
  );
  // --- calcul du panier ---
  sub(f, "calcul : paramètre de réglage", lit("function computeTotals(lines, promo) {"), "function computeTotals(lines, promo, shippingCfg = DEFAULT_SHIPPING) {", {
    done: "function computeTotals(lines, promo, shippingCfg = DEFAULT_SHIPPING) {", hint: "function computeTotals",
  });
  sub(f, "calcul : seuil", /const qualifies = discounted >= FREE_SHIPPING_THRESHOLD;/, "const qualifies = qualifiesForFreeShipping(shippingCfg, discounted);", {
    done: "const qualifies = qualifiesForFreeShipping(shippingCfg, discounted);", hint: "const qualifies",
  });
  sub(
    f,
    "calcul : « il reste X € »",
    /const remaining = round2\(Math\.max\(0, FREE_SHIPPING_THRESHOLD - discounted\)\);/,
    "const remaining = shippingCfg.enabled ? round2(Math.max(0, shippingCfg.threshold - discounted)) : 0;",
    { done: "const remaining = shippingCfg.enabled ?", hint: "const remaining" }
  );
  sub(
    f,
    "calcul : appel avec le réglage",
    lit("const totals = useMemo(() => computeTotals(cartLines, promo), [cartLines, promo]);"),
    "const totals = useMemo(() => computeTotals(cartLines, promo, shippingCfg), [cartLines, promo, shippingCfg]);",
    { done: "computeTotals(cartLines, promo, shippingCfg)", hint: "computeTotals(cartLines" }
  );
  sub(
    f,
    "barre de progression",
    lit("/ FREE_SHIPPING_THRESHOLD) * 100)"),
    "/ shippingCfg.threshold) * 100)",
    { done: "/ shippingCfg.threshold) * 100)", hint: "const progress" }
  );
  // --- état et lecture dans la base ---
  sub(
    f,
    "état du réglage de livraison",
    /^([ \t]*)(const \[fxSetting, setFxSetting\] = useState\([^\n]*)$/m,
    (m, i, rest) => `${i}${rest}\n${i}const [shippingCfg, setShippingCfg] = useState(DEFAULT_SHIPPING); // livraison offerte : montant et interrupteur (onglet « Contenu du site » de /admin), par défaut tant qu'ils ne sont pas lus`,
    { done: "const [shippingCfg, setShippingCfg]", hint: "const [fxSetting" }
  );
  sub(
    f,
    "lecture : les deux réglages dans la même requête",
    lit('optionalQuery(supabase.from(SITE_SETTINGS_TABLE).select("key, value").eq("key", SEASON_FX_KEY)),'),
    'optionalQuery(supabase.from(SITE_SETTINGS_TABLE).select("key, value").in("key", [SEASON_FX_KEY, SHIPPING_KEY])),',
    { done: "[SEASON_FX_KEY, SHIPPING_KEY]", hint: "SEASON_FX_KEY)" }
  );
  sub(
    f,
    "lecture : lignes de réglages",
    /^([ \t]*)const fxRow = fxRes && Array\.isArray\(fxRes\.data\) \? fxRes\.data\[0\] : null;[ \t]*$/m,
    (m, i) =>
      `${i}const settingRows = fxRes && Array.isArray(fxRes.data) ? fxRes.data : [];\n` +
      `${i}const fxRow = settingRows.find((r) => r.key === SEASON_FX_KEY) || null;\n` +
      `${i}const shipRow = settingRows.find((r) => r.key === SHIPPING_KEY) || null;`,
    { done: "const shipRow =", hint: "const fxRow" }
  );
  sub(
    f,
    "lecture : application du réglage",
    /^([ \t]*)(setFxSetting\(parseSeasonFxSetting\(fxRow \? fxRow\.value : null\)\);)[ \t]*$/m,
    (m, i, a) => `${i}${a}\n${i}// Livraison offerte : si la ligne n'existe pas encore (script SQL non exécuté), le site garde la valeur par défaut\n${i}setShippingCfg(parseShippingSetting(shipRow ? shipRow.value : null));`,
    { done: "setShippingCfg(parseShippingSetting(", hint: "setFxSetting(" }
  );
  // --- bandeau et phrases ---
  sub(
    f,
    "bandeau du haut de page",
    /Livraison offerte dès \{FREE_SHIPPING_THRESHOLD\} € · Créations (?:faites|façonnées) à la main en cristaux Swarovski · Paiement sécurisé/,
    "{shippingStripText(shippingCfg)}",
    { done: "{shippingStripText(shippingCfg)}", hint: "Livraison offerte dès" }
  );
  sub(f, "phrase du panier", lit("{FREE_SHIPPING_THRESHOLD} € en France"), "{shippingCfg.threshold} € en France", {
    done: "{shippingCfg.threshold} € en France", hint: "en France",
  });

  // --- barre de progression et phrases du panier : elles disparaissent quand la livraison offerte est désactivée ---
  {
    const label = "panier : barre et phrases masquées si la livraison offerte est désactivée";
    const d = docs[f];
    if (/\{shippingCfg\.enabled && \(\s*\n\s*<>/.test(d.text)) d.skipped.push(label);
    else {
      const lines = d.text.split("\n");
      const iTruck = lines.findIndex((l) => l.includes("<Truck size={14}"));
      const iText = lines.findIndex((l) => /\{shippingCfg\.threshold\} € en France/.test(l));
      if (iTruck < 1 || iText < 0) {
        problem(f, label, "je ne retrouve pas le bloc « Truck » ou la phrase « Livraison offerte dès … en France » du panier.", "<Truck");
      } else {
        const start = iTruck - 1;
        const end = iText + 1;
        const seg = lines.slice(start, end + 1).join("\n");
        const opened = count(seg, /<div\b/g) - count(seg, /<div\b[^<]*?\/>/g); // les <div ... /> auto-fermés (la barre de progression) ne s'ouvrent pas
        if (!/^\s*<div\b/.test(lines[start]) || !/^\s*<\/div>\s*$/.test(lines[end]) || opened !== count(seg, /<\/div>/g) || count(seg, /totals\.freeShipping/g) !== 2) {
          problem(f, label, "la forme du bloc du panier n'est pas celle que j'attendais (3 blocs <div> : message, barre, phrase).", "<Truck");
        } else {
          const ind = lines[start].match(/^\s*/)[0];
          lines.splice(end + 1, 0, `${ind}  </>`, `${ind})}`);
          lines.splice(start, 0, `${ind}{shippingCfg.enabled && (`, `${ind}  <>`);
          d.text = lines.join("\n");
          d.applied.push(label);
        }
      }
    }
  }
  const left = docs[f].text.split("\n").map((l, i) => [i + 1, l]).filter(([, l]) => /FREE_SHIPPING_THRESHOLD/.test(l));
  if (left.length) problem(f, "références restantes à FREE_SHIPPING_THRESHOLD", "ces lignes l'utilisent encore :\n" + left.map(([n, l]) => `    ${String(n).padStart(4)}: ${l}`).join("\n"));
}

// ============================================================
// 2. components/QuizChrome.js : le bandeau du quiz lit le même réglage
// ============================================================
{
  const f = "components/QuizChrome.js";
  sub(
    f,
    "import du réglage de livraison",
    /^(import [^\n]* from "lucide-react";)[ \t]*$/m,
    (m, a) => `${a}\nimport { DEFAULT_SHIPPING, shippingStripText } from "@/lib/shippingSettings";`,
    { done: 'from "@/lib/shippingSettings"', hint: "lucide-react" }
  );
  sub(f, "commentaire de l'ancienne constante", /^\/\/[^\n]*FREE_SHIPPING_THRESHOLD de pages\/index\.js[^\n]*\n/m, "", {
    optional: true, done: (t) => !t.includes("FREE_SHIPPING_THRESHOLD de pages/index.js"),
  });
  sub(f, "constante FREE_SHIPPING_THRESHOLD retirée", /^const FREE_SHIPPING_THRESHOLD = \d+;[ \t]*\n(?:[ \t]*\n)?/m, "", {
    done: (t) => !/const FREE_SHIPPING_THRESHOLD/.test(t), hint: "FREE_SHIPPING_THRESHOLD",
  });
  sub(f, "bandeau : paramètre", lit("export function ShippingStrip() {"), "export function ShippingStrip({ setting = DEFAULT_SHIPPING }) {", {
    done: "export function ShippingStrip({ setting = DEFAULT_SHIPPING }) {", hint: "ShippingStrip",
  });
  sub(
    f,
    "bandeau : texte",
    /Livraison offerte dès \{FREE_SHIPPING_THRESHOLD\} € · Créations (?:faites|façonnées) à la main en cristaux Swarovski · Paiement sécurisé/,
    "{shippingStripText(setting)}",
    { done: "{shippingStripText(setting)}", hint: "Livraison offerte dès" }
  );
  const left = docs[f].text.split("\n").map((l, i) => [i + 1, l]).filter(([, l]) => /FREE_SHIPPING_THRESHOLD/.test(l) && !/^\s*\/\//.test(l));
  if (left.length) problem(f, "références restantes à FREE_SHIPPING_THRESHOLD", "ces lignes l'utilisent encore :\n" + left.map(([n, l]) => `    ${String(n).padStart(4)}: ${l}`).join("\n"));
}

// ============================================================
// 3. pages/quiz.js : lecture du réglage + restes de la question « Pour affiner »
// ============================================================
{
  const f = "pages/quiz.js";
  sub(
    f,
    "import du réglage de livraison",
    /^(import \{ supabase \} from "@\/lib\/supabase";)[ \t]*$/m,
    (m, a) => `${a}\nimport { DEFAULT_SHIPPING, fetchShippingSetting } from "@/lib/shippingSettings";`,
    { done: 'from "@/lib/shippingSettings"', hint: "@/lib/supabase" }
  );
  {
    const label = "lecture du réglage de livraison";
    const d = docs[f];
    if (d.text.includes("const [shippingCfg, setShippingCfg]")) d.skipped.push(label);
    else {
      const m = /^([ \t]+)useEffect\(\(\) => \{[ \t]*$/m.exec(d.text); // le premier useEffect du composant
      if (!m) problem(f, label, "je ne trouve aucun useEffect(() => { au niveau du composant.", "useEffect(");
      else {
        const i = m[1];
        const ins =
          `${i}// Livraison offerte : montant et interrupteur réglés dans l'admin (Contenu du site) ; valeur par défaut tant qu'ils ne sont pas lus\n` +
          `${i}const [shippingCfg, setShippingCfg] = useState(DEFAULT_SHIPPING);\n` +
          `${i}useEffect(() => {\n` +
          `${i}  let alive = true;\n` +
          `${i}  fetchShippingSetting(supabase).then((s) => {\n` +
          `${i}    if (alive) setShippingCfg(s);\n` +
          `${i}  });\n` +
          `${i}  return () => {\n` +
          `${i}    alive = false;\n` +
          `${i}  };\n` +
          `${i}}, []);\n\n`;
        d.text = d.text.slice(0, m.index) + ins + d.text.slice(m.index);
        d.applied.push(label);
      }
    }
  }
  sub(f, "bandeau de livraison", lit("<ShippingStrip />"), "<ShippingStrip setting={shippingCfg} />", { done: "<ShippingStrip setting={shippingCfg} />", hint: "<ShippingStrip" });

  // --- nettoyage : restes de la question « Pour affiner » (facultatif : sans conséquence si la forme est différente) ---
  {
    const d = docs[f];
    let n = 0;
    d.text = d.text.replace(/^[ \t]*setShowWhy\(false\);[ \t]*\n/gm, () => (n++, ""));
    if (n) d.applied.push(`${n} appel(s) à setShowWhy retiré(s)`);
    const decl = /^[ \t]*const \[showWhy, setShowWhy\] = useState\(false\);[^\n]*\n/m;
    if (decl.test(d.text)) {
      if (!/showWhy|setShowWhy/.test(d.text.replace(decl, ""))) {
        d.text = d.text.replace(decl, "");
        d.applied.push("état showWhy retiré");
      } else note(f, "état showWhy", "encore utilisé ailleurs : laissé en place");
    }
    // fonction chooseMetal : retirée seulement si plus rien ne l'utilise
    const lines = d.text.split("\n");
    const k = lines.findIndex((l) => /^[ \t]*const chooseMetal = useCallback\(/.test(l));
    if (k >= 0) {
      const usedElsewhere = lines.some((l, i) => i !== k && /chooseMetal/.test(l));
      let depth = 0, end = -1, seen = false;
      for (let i = k; i < lines.length && end < 0; i++) {
        for (const ch of lines[i]) {
          if (ch === "(") { depth++; seen = true; }
          else if (ch === ")") depth--;
        }
        if (seen && depth <= 0) end = i;
      }
      if (usedElsewhere) note(f, "fonction chooseMetal", "encore utilisée ailleurs : laissée en place");
      else if (end < 0 || !/;\s*$/.test(lines[end])) note(f, "fonction chooseMetal", "forme inattendue : laissée en place (sans conséquence)");
      else {
        lines.splice(k, end - k + 1);
        if (lines[k] !== undefined && lines[k].trim() === "" && lines[k - 1] !== undefined && lines[k - 1].trim() === "") lines.splice(k, 1);
        d.text = lines.join("\n");
        d.applied.push("fonction chooseMetal retirée");
      }
    }
    // useCallback n'est retiré de l'import que s'il ne sert plus nulle part
    if (count(d.text, /\buseCallback\b/g) === 1) {
      const imp = /^import React, \{([^}]*)\} from "react";/m;
      const m = d.text.match(imp);
      if (m && /\buseCallback\b/.test(m[1])) {
        const names = m[1].split(",").map((s) => s.trim()).filter((s) => s && s !== "useCallback");
        d.text = d.text.replace(imp, `import React, { ${names.join(", ")} } from "react";`);
        d.applied.push("import inutile (useCallback)");
      }
    }
  }
  const left = docs[f].text.split("\n").map((l, i) => [i + 1, l]).filter(([, l]) => /FREE_SHIPPING_THRESHOLD/.test(l));
  if (left.length) problem(f, "références restantes à FREE_SHIPPING_THRESHOLD", "ces lignes l'utilisent encore :\n" + left.map(([n, l]) => `    ${String(n).padStart(4)}: ${l}`).join("\n"));
}

// ============================================================
// 4. components/AdminSiteMedia.js : la carte « Livraison offerte » dans « Contenu du site »
// ============================================================
{
  const f = "components/AdminSiteMedia.js";
  const d = docs[f];
  if (d.text.includes("AdminShipping")) d.skipped.push("carte « Livraison offerte »");
  else {
    const impRing = /^(import AdminRingAnimation from "@\/components\/AdminRingAnimation";)[ \t]*$/m;
    const impFx = /^(import AdminSeasonFx from "@\/components\/AdminSeasonFx";)[ \t]*$/m;
    const impRe = impRing.test(d.text) ? impRing : impFx;
    const tagRe = /^([ \t]*)(<AdminRingAnimation \/>)[ \t]*$/m.test(d.text) ? /^([ \t]*)(<AdminRingAnimation \/>)[ \t]*$/m : /^([ \t]*)(<AdminSeasonFx \/>)[ \t]*$/m;
    if (!impRe.test(d.text) || !tagRe.test(d.text)) {
      problem(f, "carte « Livraison offerte »", "je ne retrouve pas l'import ou l'emplacement de la carte « Animation saisonnière » / « Animation Le geste ».", "AdminSeasonFx");
    } else {
      d.text = d.text.replace(impRe, (m, a) => `${a}\nimport AdminShipping from "@/components/AdminShipping";`);
      d.text = d.text.replace(tagRe, (m, i, a) => `${i}${a}\n\n${i}{/* LIVRAISON OFFERTE : montant et interrupteur */}\n${i}<AdminShipping />`);
      d.applied.push("carte « Livraison offerte »");
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
if (notes.length) console.log("\nNotes (sans conséquence) :\n" + notes.join("\n"));
console.log(nWritten ? `\nTerminé : ${nWritten} fichier(s) modifié(s). Étape suivante : git diff --stat, puis npm run build.` : "\nRien à modifier.");
