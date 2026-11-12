// ============================================================
// PATCH — LES MINIATURES NE SONT PLUS PROPOSEES COMME « FICHIERS ORPHELINS » — ZENORIA_MEDIA_VARIANTS_ORPHANS_V1
//
// Probleme : l'ecran « Fichiers orphelins » (Quotas) considere comme orphelin tout fichier que ni une collection ni le
// contenu du site ne reference. Une miniature (thumb_...) ou une image fixe (poster_...) n'est reference par personne :
// son chemin se deduit de celui de l'original. L'outil les proposait donc a la suppression (« Tout cocher »).
//
// Correctif : un fichier est desormais « utilise » si lui-meme OU son original est reference. Cela protege aussi la
// suppression (la relecture des references juste avant de supprimer applique la meme regle). Une miniature dont
// l'original n'est plus utilise reste proposee comme orpheline, ce qui est voulu.
// Le comptage « references vers un fichier absent » n'est PAS modifie (il continue de ne regarder que les vraies references).
//
// Modifie : lib/orphanFiles.js (uniquement). Prerequis : lib/mediaVariants.js (lot 4a).
// Tout ou rien : chaque repere doit exister UNE SEULE fois, sur une ligne entiere ; indentation et fins de ligne conservees.
// Usage : node scripts/patch-orphans-variants.mjs
// ============================================================
import fs from "node:fs";
import path from "node:path";

const TAG = "[patch-orphans-variants]";
const FILE = "lib/orphanFiles.js";
const MARKER = "ZENORIA_MEDIA_VARIANTS_ORPHANS_V1";
const REQUIRED = "lib/mediaVariants.js";

const NEW_FN = [
  "// " + MARKER + " : un fichier est « utilise » si lui-meme OU son original est reference.",
  "// Miniature (thumb_) et image fixe (poster_) se deduisent du chemin de l'original (lib/mediaVariants.js) : personne ne les reference.",
  "export function withVariantPaths(refs) {",
  "  const out = new Set(refs);",
  "  refs.forEach((p) => variantPaths(p).forEach((v) => out.add(v)));",
  "  return out;",
  "}",
  "",
];

// Chaque modification remplace UNE ligne entiere (reperee sans son indentation) par une ou plusieurs lignes.
const EDITS = [
  { name: "import des variantes", anchor: 'export const MEDIA_BUCKET = "product-media";', lines: (l) => ['import { variantPaths } from "./mediaVariants.js"; // ' + MARKER, l] },
  { name: "fonction withVariantPaths", anchor: "// Ensemble des chemins du stockage utilisés par les collections et par les emplacements du site.", lines: (l) => [...NEW_FN, l] },
  { name: "classement : ensemble protege", anchor: "const present = new Set();", lines: (l) => ["const protectedPaths = withVariantPaths(refs); // " + MARKER, l] },
  { name: "classement : fichier utilise", anchor: "if (refs.has(f.name)) {", lines: () => ["if (protectedPaths.has(f.name)) { // " + MARKER] },
  { name: "suppression : ensemble protege", anchor: "const refs = buildReferenceSet(fresh.products, fresh.siteRows);", lines: (l) => [l, "const protectedPaths = withVariantPaths(refs); // " + MARKER] },
  { name: "suppression : fichier utilise", anchor: "if (refs.has(o.path)) skippedUsed.push(o.path);", lines: () => ["if (protectedPaths.has(o.path)) skippedUsed.push(o.path); // " + MARKER] },
];

const count = (t, n) => { let c = 0, i = t.indexOf(n); while (i !== -1) { c += 1; i = t.indexOf(n, i + n.length); } return c; };

const problems = [];
if (!fs.existsSync(path.join(process.cwd(), REQUIRED))) problems.push(REQUIRED + " : fichier introuvable (lot 4a non applique ?)");
const full = path.join(process.cwd(), FILE);
if (!fs.existsSync(full)) problems.push(FILE + " : fichier introuvable (lancer le script depuis le dossier du projet)");
let out = null;
let crlf = false;
if (fs.existsSync(full)) {
  const raw = fs.readFileSync(full, "utf8");
  crlf = raw.includes("\r\n");
  const text = raw.replace(/\r\n/g, "\n");
  if (text.includes(MARKER)) {
    problems.push(FILE + " : deja patche (" + MARKER + " present), rien a faire");
  } else {
    const located = [];
    for (const e of EDITS) {
      const n = count(text, e.anchor);
      if (n !== 1) { problems.push(FILE + " : repere \"" + e.name + "\" trouve " + n + " fois (attendu : 1)"); continue; }
      const idx = text.indexOf(e.anchor);
      const lineStart = text.lastIndexOf("\n", idx) + 1;
      let lineEnd = text.indexOf("\n", idx);
      if (lineEnd === -1) lineEnd = text.length;
      const indent = text.slice(lineStart, idx);
      if (indent.trim() !== "" || text.slice(idx + e.anchor.length, lineEnd).trim() !== "") { problems.push(FILE + " : repere \"" + e.name + "\" n'occupe pas une ligne entiere"); continue; }
      located.push({ lineStart, lineEnd, indent, e });
    }
    if (problems.length === 0) {
      let t = text;
      located.sort((a, b) => b.lineStart - a.lineStart); // de la fin vers le debut : les positions restent valables
      for (const s of located) {
        const original = text.slice(s.lineStart, s.lineEnd);
        const block = s.e.lines(original.trim()).map((l) => (l === "" ? "" : s.indent + l)).join("\n");
        t = t.slice(0, s.lineStart) + block + t.slice(s.lineEnd);
      }
      out = crlf ? t.replace(/\n/g, "\r\n") : t;
    }
  }
}
if (problems.length > 0 || out === null) {
  console.error(TAG + " au moins un probleme, RIEN n a ete ecrit :");
  problems.forEach((p) => console.error("  - " + p));
  process.exit(1);
}
fs.writeFileSync(full, out, "utf8");
console.log(TAG + " 1 fichier mis a jour : " + FILE + " (" + (crlf ? "CRLF" : "LF") + ")");
