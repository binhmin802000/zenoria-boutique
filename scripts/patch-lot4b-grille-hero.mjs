// ============================================================
// PATCH LOT 4b — MINIATURES DANS LA GRILLE DE L'ACCUEIL ET VIDEO D'ACCUEIL ALLEGEE — ZENORIA_HERO_MEDIA_V1
//
// Modifie : components/ProductParts.js, pages/index.js
// Prerequis (a copier AVANT, ce script ne les cree pas) : components/HeroMedia.js ; lot 4a deja en place
// (lib/mediaVariants.js, components/ThumbImage.js, getThumbUrl et getPosterUrl dans lib/supabase.js).
//
// Ce que fait le lot :
//   - la grille « Nos creations » affiche la MINIATURE de chaque bague (repli automatique sur la photo d'origine) ;
//     la fiche bague et les visuels agrandis gardent la photo complete ;
//   - la video d'accueil (cercle de la banniere) ne se telecharge plus pour les visiteuses sur ecran etroit, en economie
//     de donnees, en connexion 2G ou avec « reduire les animations » : image fixe + bouton ▶. Ordinateur : inchange.
//
// Tout ou rien : chaque repere doit exister UNE SEULE fois, sinon rien n'est ecrit nulle part.
// Fins de ligne (CRLF/LF) et indentation conservees. Relancer apres succes est refuse.
// Usage : node scripts/patch-lot4b-grille-hero.mjs
// ============================================================
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TAG = "[patch-lot4b-grille-hero]";
const MARKER = "ZENORIA_HERO_MEDIA_V1";
const REQUIRED = ["components/HeroMedia.js", "components/ThumbImage.js", "lib/mediaVariants.js"];

const ind = (indent, lines) => lines.map((l) => (l === "" ? "" : indent + l)).join("\n");

const productPartsEdits = [
  {
    name: "imports",
    find: 'import { getMediaUrl } from "@/lib/supabase";',
    replace: [
      'import { getMediaUrl, getPosterUrl, getThumbUrl } from "@/lib/supabase"; // ' + MARKER,
      'import ThumbImage from "@/components/ThumbImage"; // ' + MARKER,
      'import HeroMedia from "@/components/HeroMedia"; // ' + MARKER,
    ].join("\n"),
  },
  {
    name: "video en cercle (repli de la banniere)",
    regex: /^([ \t]*)if \(circle && video && videoSrc && !imgError\) \{\n[ \t]*return \(\n[ \t]*<div className="relative w-full h-full rounded-full overflow-hidden bg-black">\n[ \t]*\{\/\* ZENORIA_PRELOAD_VIDEOS_V1[^\n]*\*\/\}\n[ \t]*<video\n[\s\S]*?\n[ \t]*\/>\n[ \t]*<\/div>\n[ \t]*\);\n[ \t]*\}/m,
    fn: (m, i) =>
      ind(i, [
        "if (circle && video && videoSrc && !imgError) {",
        "  // " + MARKER + " : image fixe + ▶ sur ecran etroit / economie de donnees (voir components/HeroMedia.js)",
        "  return (",
        "    <HeroMedia",
        "      videoSrc={videoSrc}",
        "      posterSrc={getPosterUrl(product.video, product.slug)}",
        "      fallbackSrc={product.photos && product.photos[0] ? getThumbUrl(product.photos[0], product.slug) : null}",
        "      onVideoError={() => setImgError(true)}",
        "    />",
        "  );",
        "}",
      ]),
  },
  {
    name: "photo de la carte (grille)",
    regex: /^([ \t]*)<div className=\{`relative overflow-hidden \$\{large \? "h-\[360px\]" : "h-56"\}`\}>\n[ \t]*\{\/\* eslint-disable-next-line @next\/next\/no-img-element \*\/\}\n[ \t]*<img\n[ \t]*src=\{imgSrc\}\n[ \t]*alt=\{product\.name\}\n[ \t]*onError=\{\(\) => setImgError\(true\)\}\n[ \t]*className="w-full h-full object-cover object-center"\n[ \t]*\/>\n[ \t]*<\/div>$/m,
    fn: (m, i) =>
      ind(i, [
        '<div className={`relative overflow-hidden ${large ? "h-[360px]" : "h-56"}`}>',
        "  {/* " + MARKER + " : miniature dans la grille, photo complete pour les visuels agrandis */}",
        "  {large ? (",
        "    // eslint-disable-next-line @next/next/no-img-element",
        '    <img src={imgSrc} alt={product.name} onError={() => setImgError(true)} className="w-full h-full object-cover object-center" />',
        "  ) : (",
        '    <ThumbImage path={product.photos[0]} slug={product.slug} alt={product.name} onFail={() => setImgError(true)} className="w-full h-full object-cover object-center" />',
        "  )}",
        "</div>",
      ]),
  },
];

const indexEdits = [
  {
    name: "imports",
    find: 'import { supabase, getMediaUrl } from "@/lib/supabase";',
    replace: [
      'import { supabase, getMediaUrl, getPosterUrl, getThumbUrl } from "@/lib/supabase"; // ' + MARKER,
      'import HeroMedia from "@/components/HeroMedia"; // ' + MARKER,
    ].join("\n"),
  },
  {
    name: "video d'accueil",
    regex: /^([ \t]*)return \(\n[ \t]*<div className="relative w-full h-full rounded-full overflow-hidden bg-black">\n[ \t]*\{\/\* ZENORIA_PRELOAD_VIDEOS_V1[^\n]*\*\/\}\n[ \t]*<video\n[ \t]*key=\{src\}[\s\S]*?\n[ \t]*\/>\n[ \t]*<\/div>\n[ \t]*\);/m,
    fn: (m, i) =>
      ind(i, [
        "// " + MARKER + " : image fixe + ▶ sur ecran etroit / economie de donnees (voir components/HeroMedia.js)",
        "return (",
        "  <HeroMedia",
        "    videoSrc={src}",
        '    posterSrc={getPosterUrl(path, "site")}',
        "    fallbackSrc={fallback && fallback.photos && fallback.photos[0] ? getThumbUrl(fallback.photos[0], fallback.slug) : null}",
        "    onVideoError={() => setFailed(true)}",
        "  />",
        ");",
      ]),
  },
];

const count = (text, e) => (e.regex ? (text.match(new RegExp(e.regex.source, e.regex.flags.includes("g") ? e.regex.flags : e.regex.flags + "g")) || []).length : text.split(e.find).length - 1);

function prepare(rel, edits, problems) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) { problems.push(rel + " : fichier introuvable (lancer le script depuis le dossier du projet)"); return null; }
  const raw = fs.readFileSync(full, "utf8");
  const crlf = raw.includes("\r\n");
  let text = raw.replace(/\r\n/g, "\n");
  if (text.includes(MARKER)) { problems.push(rel + " : deja patche (" + MARKER + " present), rien a faire"); return null; }
  let ok = true;
  for (const e of edits) {
    const n = count(text, e);
    if (n !== 1) { problems.push(rel + " : repere \"" + e.name + "\" trouve " + n + " fois (attendu : 1)"); ok = false; }
  }
  if (!ok) return null;
  for (const e of edits) text = e.regex ? text.replace(e.regex, e.fn) : text.replace(e.find, () => e.replace);
  return { full, out: crlf ? text.replace(/\n/g, "\r\n") : text, crlf };
}

const problems = [];
for (const rel of REQUIRED) if (!fs.existsSync(path.join(ROOT, rel))) problems.push(rel + " : fichier a copier avant de lancer ce script");
const supa = path.join(ROOT, "lib/supabase.js");
if (fs.existsSync(supa)) {
  const s = fs.readFileSync(supa, "utf8");
  if (!s.includes("export function getThumbUrl") || !s.includes("export function getPosterUrl")) problems.push("lib/supabase.js : getThumbUrl/getPosterUrl absents (lot 4a non applique ?)");
} else problems.push("lib/supabase.js : fichier introuvable");

const targets = [["components/ProductParts.js", productPartsEdits], ["pages/index.js", indexEdits]];
const prepared = {};
for (const [rel, edits] of targets) prepared[rel] = prepare(rel, edits, problems);
if (problems.length > 0 || Object.values(prepared).some((p) => !p)) {
  console.error(TAG + " au moins un probleme, RIEN n a ete ecrit :");
  problems.forEach((p) => console.error("  - " + p));
  process.exit(1);
}
for (const [rel] of targets) {
  const p = prepared[rel];
  fs.writeFileSync(p.full, p.out, "utf8");
  console.log(TAG + " mis a jour : " + rel + " (" + (p.crlf ? "CRLF" : "LF") + ")");
}
