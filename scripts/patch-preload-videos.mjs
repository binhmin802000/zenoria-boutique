// ============================================================
// patch-preload-videos.mjs
// ZENORIA_PRELOAD_VIDEOS_V1
//
// Ajoute preload="metadata" aux 3 balises <video> du site, pour
// reduire le volume transfere (cached egress Supabase) sans casser
// l'autoplay des vidéos visibles immediatement (Hero) :
//   1. pages/index.js            -> HeroVideo (video d'accueil)
//   2. components/ProductParts.js -> RingVisual (video de secours du Hero)
//   3. components/ProductParts.js -> ProductMedia (video de la fiche produit)
//
// preload="metadata" (et non "none") est choisi pour ne pas retarder
// ni bloquer l'autoplay des vidéos 1 et 2, visibles des le chargement
// de la page.
//
// Usage :
//   node scripts/patch-preload-videos.mjs
//
// Idempotent : si les marqueurs de la V1 sont deja presents dans les
// deux fichiers, le script s'arrete sans rien modifier. Chaque ancre
// est verifiee individuellement ; si l'une d'elles ne correspond pas
// EXACTEMENT (une seule fois) au fichier reel, le script s'arrete
// sans ecrire quoi que ce soit, avec un message clair.
// ============================================================
import fs from "node:fs";
import path from "node:path";

const INDEX_FILE = path.join(process.cwd(), "pages", "index.js");
const PARTS_FILE = path.join(process.cwd(), "components", "ProductParts.js");

let hadError = false;

function fail(label, message) {
  console.error(`[patch-preload-videos] ${label} : ${message}`);
  hadError = true;
}

function readNormalized(file) {
  const original = fs.readFileSync(file, "utf8");
  const usesCRLF = original.includes("\r\n");
  const normalized = original.replace(/\r\n/g, "\n");
  return { original, usesCRLF, normalized };
}

function writeNormalized(file, content, usesCRLF) {
  const out = usesCRLF ? content.replace(/\n/g, "\r\n") : content;
  fs.writeFileSync(file, out, "utf8");
}

function applyOne(file, label, anchor, replacement) {
  const { normalized, usesCRLF } = readNormalized(file);
  if (normalized.includes("ZENORIA_PRELOAD_VIDEOS_V1")) {
    return { skipped: true };
  }
  const count = normalized.split(anchor).length - 1;
  if (count !== 1) {
    fail(label, `ancre trouvée ${count} fois au lieu de 1 dans ${file}. Fichier modifié depuis ? Rien n'a été écrit.`);
    return { skipped: false, applied: false };
  }
  const updated = normalized.replace(anchor, replacement);
  return { skipped: false, applied: true, updated, usesCRLF };
}

// ------------------------------------------------------------
// Vérifications préalables
// ------------------------------------------------------------
if (!fs.existsSync(INDEX_FILE)) fail("pages/index.js", `fichier introuvable : ${INDEX_FILE}`);
if (!fs.existsSync(PARTS_FILE)) fail("components/ProductParts.js", `fichier introuvable : ${PARTS_FILE}`);
if (hadError) process.exit(1);

const { normalized: indexNorm } = readNormalized(INDEX_FILE);
const { normalized: partsNorm } = readNormalized(PARTS_FILE);

if (indexNorm.includes("ZENORIA_PRELOAD_VIDEOS_V1") && partsNorm.includes("ZENORIA_PRELOAD_VIDEOS_V1")) {
  console.log("[patch-preload-videos] déjà appliqué, rien à faire.");
  process.exit(0);
}

// ------------------------------------------------------------
// 1) pages/index.js — HeroVideo
// ------------------------------------------------------------
const indexAnchor =
  '      <video\n' +
  '        key={src}\n' +
  '        src={src}\n' +
  '        autoPlay\n' +
  '        loop\n' +
  '        muted\n' +
  '        playsInline\n' +
  '        onError={() => setFailed(true)}\n' +
  '        className="w-full h-full object-cover object-center"\n' +
  '      />\n';

const indexReplacement =
  '      {/* ZENORIA_PRELOAD_VIDEOS_V1 : preload metadata pour reduire le cached egress sans bloquer l\'autoplay */}\n' +
  '      <video\n' +
  '        key={src}\n' +
  '        src={src}\n' +
  '        autoPlay\n' +
  '        loop\n' +
  '        muted\n' +
  '        playsInline\n' +
  '        preload="metadata"\n' +
  '        onError={() => setFailed(true)}\n' +
  '        className="w-full h-full object-cover object-center"\n' +
  '      />\n';

// ------------------------------------------------------------
// 2) components/ProductParts.js — RingVisual (video de secours du Hero)
// ------------------------------------------------------------
const ringAnchor =
  '        <video\n' +
  '          key={videoSrc}\n' +
  '          src={videoSrc}\n' +
  '          autoPlay\n' +
  '          loop\n' +
  '          muted\n' +
  '          playsInline\n' +
  '          onError={() => setImgError(true)}\n' +
  '          className="w-full h-full object-cover object-center"\n' +
  '        />\n';

const ringReplacement =
  '        {/* ZENORIA_PRELOAD_VIDEOS_V1 : preload metadata pour reduire le cached egress sans bloquer l\'autoplay */}\n' +
  '        <video\n' +
  '          key={videoSrc}\n' +
  '          src={videoSrc}\n' +
  '          autoPlay\n' +
  '          loop\n' +
  '          muted\n' +
  '          playsInline\n' +
  '          preload="metadata"\n' +
  '          onError={() => setImgError(true)}\n' +
  '          className="w-full h-full object-cover object-center"\n' +
  '        />\n';

// ------------------------------------------------------------
// 3) components/ProductParts.js — ProductMedia (video de la fiche produit)
// ------------------------------------------------------------
const mediaAnchor =
  '          <video\n' +
  '            key={videoSrc}\n' +
  '            src={videoSrc}\n' +
  '            autoPlay\n' +
  '            loop\n' +
  '            muted\n' +
  '            playsInline\n' +
  '            controls\n' +
  '            onError={() => setVideoError(true)}\n' +
  '            className="w-full h-full object-cover object-center"\n' +
  '          />\n';

// Note : ici <video> est l'unique expression d'une branche de ternaire (pas un
// enfant direct d'une balise parente) -> on utilise un commentaire JS "//"
// classique, et non la syntaxe JSX "{/* */}" utilisée pour les 2 autres cas.
const mediaReplacement =
  '          // ZENORIA_PRELOAD_VIDEOS_V1 : preload metadata, chargee seulement a l\'ouverture de la fiche produit\n' +
  '          <video\n' +
  '            key={videoSrc}\n' +
  '            src={videoSrc}\n' +
  '            autoPlay\n' +
  '            loop\n' +
  '            muted\n' +
  '            playsInline\n' +
  '            controls\n' +
  '            preload="metadata"\n' +
  '            onError={() => setVideoError(true)}\n' +
  '            className="w-full h-full object-cover object-center"\n' +
  '          />\n';

// ------------------------------------------------------------
// Application (tout ou rien par fichier : si une des deux ancres de
// ProductParts.js echoue, aucune des deux n'est ecrite)
// ------------------------------------------------------------
const indexResult = applyOne(INDEX_FILE, "pages/index.js (HeroVideo)", indexAnchor, indexReplacement);

let partsNormalizedWork = partsNorm;
let partsUsesCRLF = readNormalized(PARTS_FILE).usesCRLF;
let ringOk = false;
let mediaOk = false;

if (!partsNorm.includes("ZENORIA_PRELOAD_VIDEOS_V1")) {
  const ringCount = partsNormalizedWork.split(ringAnchor).length - 1;
  if (ringCount !== 1) {
    fail("components/ProductParts.js (RingVisual)", `ancre trouvée ${ringCount} fois au lieu de 1. Rien n'a été écrit.`);
  } else {
    ringOk = true;
  }

  const mediaCount = partsNormalizedWork.split(mediaAnchor).length - 1;
  if (mediaCount !== 1) {
    fail("components/ProductParts.js (ProductMedia)", `ancre trouvée ${mediaCount} fois au lieu de 1. Rien n'a été écrit.`);
  } else {
    mediaOk = true;
  }
}

if (hadError) {
  console.error("[patch-preload-videos] Au moins une ancre ne correspond pas. Aucun fichier n'a été modifié.");
  process.exit(1);
}

// pages/index.js
if (indexResult.skipped) {
  console.log("[patch-preload-videos] pages/index.js : déjà appliqué, inchangé.");
} else if (indexResult.applied) {
  writeNormalized(INDEX_FILE, indexResult.updated, indexResult.usesCRLF);
  console.log("[patch-preload-videos] pages/index.js : preload=\"metadata\" ajouté (HeroVideo).");
}

// components/ProductParts.js (les deux remplacements ensemble)
if (partsNorm.includes("ZENORIA_PRELOAD_VIDEOS_V1")) {
  console.log("[patch-preload-videos] components/ProductParts.js : déjà appliqué, inchangé.");
} else if (ringOk && mediaOk) {
  let updated = partsNormalizedWork.replace(ringAnchor, ringReplacement);
  updated = updated.replace(mediaAnchor, mediaReplacement);
  writeNormalized(PARTS_FILE, updated, partsUsesCRLF);
  console.log("[patch-preload-videos] components/ProductParts.js : preload=\"metadata\" ajouté (RingVisual + ProductMedia).");
}

console.log("[patch-preload-videos] Terminé : 3 balises <video> mises à jour au total.");
