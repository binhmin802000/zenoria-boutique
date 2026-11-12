// ============================================================
// PATCH LOT 4a — MINIATURES DES PHOTOS DE BIJOUX — ZENORIA_MEDIA_VARIANTS_V1
//
// Modifie : lib/supabase.js, pages/index.js, pages/compte.js, components/QuizResult.js, components/AdminSiteMedia.js
// Prerequis (fichiers a copier AVANT, ce script ne les cree pas) :
//   lib/mediaVariants.js, lib/mediaVariantsBrowser.js, components/ThumbImage.js, components/AdminMediaVariants.js
//
// Ce que fait le lot :
//   - desormais, chaque photo de bijou envoyee depuis /admin est accompagnee d'une MINIATURE (640 px, ~40-70 Ko) rangee a
//     cote, sous « thumb_<nom> » ; chaque video, d'une IMAGE FIXE sous « poster_<nom>.jpg » (servira au lot 4b) ;
//   - la suppression d'un media supprime aussi ses variantes ;
//   - les vignettes du panier, des favoris, de Mon compte et du resultat du quiz utilisent la miniature, avec repli
//     automatique sur la photo d'origine (aucune image cassee possible) ;
//   - une carte « Miniatures des bijoux » dans /admin > Contenu du site > Vitrine & ambiance cree les miniatures
//     manquantes des photos deja en ligne.
//
// Tout ou rien : chaque repere doit exister UNE SEULE fois dans chaque fichier, sinon rien n'est ecrit NULLE PART.
// Fins de ligne (CRLF/LF) et indentation conservees. Relancer apres succes est refuse.
// Usage : node scripts/patch-lot4a-miniatures.mjs
// ============================================================
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TAG = "[patch-lot4a-miniatures]";
const MARKER = "ZENORIA_MEDIA_VARIANTS_V1";
const REQUIRED_NEW_FILES = ["lib/mediaVariants.js", "lib/mediaVariantsBrowser.js", "components/ThumbImage.js", "components/AdminMediaVariants.js"];

const SUPABASE_HELPERS = [
  "// " + MARKER + " : variantes legeres des medias (miniature d'une photo, image fixe d'une video), deduites du chemin d'origine",
  "// Adresse de la miniature d'une photo. Sans miniature possible (ancien format), renvoie l'adresse de l'original.",
  "export function getThumbUrl(path, slug) {",
  "  const t = thumbPath(path);",
  "  return t ? getMediaUrl(t, slug) : getMediaUrl(path, slug);",
  "}",
  "",
  "// Adresse de l'image fixe d'une video, ou null si elle n'a pas d'image fixe (ancien format).",
  "export function getPosterUrl(path, slug) {",
  "  const p = posterPath(path);",
  "  return p ? getMediaUrl(p, slug) : null;",
  "}",
  "",
  "// Envoie le media, puis (au mieux) sa variante : jamais d'erreur ici, un echec de variante ne bloque jamais l'envoi.",
  "//  - photo de bijou (hors dossier site/) : miniature ; video : image fixe.",
  "async function uploadWithVariants(path, blob, opts) {",
  "  const res = await supabase.storage.from(PRODUCT_MEDIA_BUCKET).upload(path, blob, opts);",
  "  if (res.error) return res;",
  "  try {",
  "    const type = (blob && blob.type) || \"\";",
  "    let variant = null;",
  "    let target = null;",
  "    if (type.startsWith(\"image/\") && !path.startsWith(\"site/\")) {",
  "      target = thumbPath(path);",
  "      if (target) variant = await makeThumbBlob(blob);",
  "    } else if (type.startsWith(\"video/\")) {",
  "      target = posterPath(path);",
  "      if (target) variant = await makePosterBlob(blob);",
  "    }",
  "    if (variant && target) {",
  "      await supabase.storage.from(PRODUCT_MEDIA_BUCKET).upload(target, variant, { cacheControl: \"31536000\", upsert: false, contentType: \"image/jpeg\" });",
  "    }",
  "  } catch (e) {",
  "    // variante non creee : le site retombe sur l'original",
  "  }",
  "  return res;",
  "}",
  "",
];

// anchor : texte a trouver (une seule fois) ; replace : texte de remplacement.
const supabaseEdits = [
  {
    name: "import des variantes",
    find: 'import { observedFetch } from "./errorLogger";',
    replace: [
      'import { observedFetch } from "./errorLogger";',
      'import { thumbPath, posterPath, variantPaths } from "./mediaVariants"; // ' + MARKER,
      'import { makeThumbBlob, makePosterBlob } from "./mediaVariantsBrowser"; // ' + MARKER,
    ].join("\n"),
  },
  {
    name: "fonctions de variantes (avant le televersement)",
    find: "// Televerse une photo ou une video dans Supabase Storage, dans un dossier",
    replace: SUPABASE_HELPERS.join("\n") + "// Televerse une photo ou une video dans Supabase Storage, dans un dossier",
  },
  {
    name: "televersement d'une photo ou d'une video de bijou",
    find: "  const path = `${slug}/${Date.now()}-${cleanName}`;\n  const { error } = await supabase.storage.from(PRODUCT_MEDIA_BUCKET).upload(path, toUpload, {",
    replace: "  const path = `${slug}/${Date.now()}-${cleanName}`;\n  const { error } = await uploadWithVariants(path, toUpload, { // " + MARKER,
  },
  {
    name: "televersement du contenu du site",
    find: "  const path = `site/${slot}/${Date.now()}-${cleanName}`;\n  const { error } = await supabase.storage.from(PRODUCT_MEDIA_BUCKET).upload(path, toUpload, {",
    replace: "  const path = `site/${slot}/${Date.now()}-${cleanName}`;\n  const { error } = await uploadWithVariants(path, toUpload, { // " + MARKER,
  },
  {
    name: "suppression d'un media et de ses variantes",
    find: "    await supabase.storage.from(PRODUCT_MEDIA_BUCKET).remove([path]);",
    replace: "    await supabase.storage.from(PRODUCT_MEDIA_BUCKET).remove(variantPaths(path)); // " + MARKER + " : le media et ses variantes",
  },
];

const indexEdits = [
  {
    name: "import de ThumbImage",
    find: 'import { supabase, getMediaUrl } from "@/lib/supabase";',
    replace: 'import { supabase, getMediaUrl } from "@/lib/supabase";\nimport ThumbImage from "@/components/ThumbImage"; // ' + MARKER,
  },
  {
    name: "vignette du panier et des favoris",
    find: '<img src={src} alt={product.name} onError={() => setImgError(true)} className="w-full h-full object-cover object-center" />',
    replace: '<ThumbImage /* ' + MARKER + ' */ path={product.photos[0]} slug={product.slug} alt={product.name} onFail={() => setImgError(true)} className="w-full h-full object-cover object-center" />',
  },
];

const compteEdits = [
  {
    name: "import de ThumbImage",
    find: 'import { supabase, getMediaUrl, SITE_MEDIA_TABLE, SITE_SLOT_ACCOUNT_HERO } from "@/lib/supabase";',
    replace: 'import { supabase, getMediaUrl, SITE_MEDIA_TABLE, SITE_SLOT_ACCOUNT_HERO } from "@/lib/supabase";\nimport ThumbImage from "@/components/ThumbImage"; // ' + MARKER,
  },
  {
    name: "vignette d'une commande",
    find: '<img src={src} alt="" onError={() => setErr(true)} className="h-14 w-14 rounded-xl object-cover shrink-0 bg-[#f5edf1]" />',
    replace: '<ThumbImage /* ' + MARKER + ' */ path={photo} slug={item.product.slug} alt="" onFail={() => setErr(true)} className="h-14 w-14 rounded-xl object-cover shrink-0 bg-[#f5edf1]" />',
  },
  {
    name: "vignette d'un favori",
    find: "return <img src={src} alt=\"\" onError={() => setErr(true)} className={`${size} rounded-xl object-cover shrink-0 bg-[#f5edf1]`} />;",
    replace: "return <ThumbImage path={product.photos[0]} slug={product.slug} alt=\"\" onFail={() => setErr(true)} className={`${size} rounded-xl object-cover shrink-0 bg-[#f5edf1]`} />; // " + MARKER,
  },
];

const quizEdits = [
  {
    name: "import de ThumbImage",
    find: 'import { getMediaUrl } from "@/lib/supabase";',
    replace: 'import { getMediaUrl } from "@/lib/supabase";\nimport ThumbImage from "@/components/ThumbImage"; // ' + MARKER,
  },
  {
    name: "vignette d'une bague conseillee",
    find: '<img src={src} alt={product.name} onError={() => setFailed(true)} className="absolute inset-0 w-full h-full object-cover object-center" />',
    replace: '<ThumbImage /* ' + MARKER + ' */ path={product.photos[0]} slug={product.slug} alt={product.name} onFail={() => setFailed(true)} className="absolute inset-0 w-full h-full object-cover object-center" />',
  },
];

const adminSiteMediaEdits = [
  {
    name: "import de la carte",
    find: 'import AdminCareInfo from "@/components/AdminCareInfo"; // ZENORIA_CARE_INFO_V1',
    replace: 'import AdminCareInfo from "@/components/AdminCareInfo"; // ZENORIA_CARE_INFO_V1\nimport AdminMediaVariants from "@/components/AdminMediaVariants"; // ' + MARKER,
  },
  {
    name: "compte de cartes de Vitrine & ambiance",
    find: "count={6} // ZENORIA_CARE_INFO_V1 : 5 -> 6 (carte Entretien du bijou)",
    replace: "count={7} // " + MARKER + " : 6 -> 7 (carte Miniatures des bijoux)",
  },
  {
    name: "carte ajoutee apres Entretien du bijou",
    // Independant de l'indentation (relevee dans le fichier reel : 8 espaces pour la balise, 10 pour le composant).
    regex: /^([ \t]*)<div data-config-card="care_info" style=\{\{ scrollMarginTop: 84 \}\}> \{\/\* ZENORIA_CARE_INFO_V1 \*\/\}\n[ \t]*<AdminCareInfo \/>\n[ \t]*<\/div>$/gm,
    replaceFn: (m, indent) =>
      m + "\n" + indent + '<div data-config-card="media_variants" style={{ scrollMarginTop: 84 }}> {/* ' + MARKER + " */}\n" + indent + "  <AdminMediaVariants />\n" + indent + "</div>",
  },
];

function occurrences(text, needle) {
  let n = 0;
  let i = text.indexOf(needle);
  while (i !== -1) { n += 1; i = text.indexOf(needle, i + needle.length); }
  return n;
}

function prepare(rel, edits, problems) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) { problems.push(rel + " : fichier introuvable (lancer le script depuis le dossier du projet)"); return null; }
  const raw = fs.readFileSync(full, "utf8");
  const crlf = raw.includes("\r\n");
  let text = raw.replace(/\r\n/g, "\n");
  if (text.includes(MARKER)) { problems.push(rel + " : deja patche (" + MARKER + " present), rien a faire"); return null; }
  let ok = true;
  for (const e of edits) {
    const n = e.regex ? (text.match(e.regex) || []).length : occurrences(text, e.find);
    if (n !== 1) { problems.push(rel + " : repere \"" + e.name + "\" trouve " + n + " fois (attendu : 1)"); ok = false; }
  }
  if (!ok) return null;
  for (const e of edits) text = e.regex ? text.replace(e.regex, e.replaceFn) : text.replace(e.find, () => e.replace);
  return { full, out: crlf ? text.replace(/\n/g, "\r\n") : text, crlf };
}

const problems = [];
for (const rel of REQUIRED_NEW_FILES) if (!fs.existsSync(path.join(ROOT, rel))) problems.push(rel + " : fichier a copier avant de lancer ce script");

const targets = [
  ["lib/supabase.js", supabaseEdits],
  ["pages/index.js", indexEdits],
  ["pages/compte.js", compteEdits],
  ["components/QuizResult.js", quizEdits],
  ["components/AdminSiteMedia.js", adminSiteMediaEdits],
];
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
