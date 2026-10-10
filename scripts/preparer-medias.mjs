#!/usr/bin/env node
// ============================================================
// preparer-medias.mjs - Prepare les photos et videos AVANT de les mettre sur le site
//
// Pour chaque fichier du dossier source (sous-dossiers compris) :
//   PHOTOS : redimensionnees (cote le plus long = 1600 px, jamais agrandies),
//            filigrane "(c) 2026 ZENORIA" ajoute, recompressees en JPEG,
//            orientation EXIF appliquee, donnees EXIF (GPS, appareil...) supprimees.
//   VIDEOS : redimensionnees (720p maximum), filigrane ajoute, recompressees en
//            H.264 pour le web, son supprime, metadonnees supprimees.
//
// LES ORIGINAUX NE SONT JAMAIS MODIFIES. Les copies sont creees dans un
// dossier "<source>_pour_le_site", avec la meme arborescence. Les noms de
// dossiers y sont "slugifies" (ex. "bleu de mer" -> "bleu-de-mer") pour pouvoir
// etre copies tels quels dans public/images/ du site.
//
// PREREQUIS : Node.js (deja installe pour le site) et ffmpeg (avec ffprobe)
//             accessible depuis le terminal : commande "ffmpeg -version".
//
// UTILISATION (depuis le dossier du projet) :
//   node scripts/preparer-medias.mjs "C:\Users\RH5514\Downloads\Bagues"
//
// OPTIONS :
//   --position bas-gauche  filigrane en bas a gauche (par defaut)
//   --position centre      filigrane au centre, a 66 % de la hauteur
//   --sortie "<dossier>"   dossier de destination (defaut : <source>_pour_le_site)
//   --sans-filigrane       n'ajoute pas le filigrane
//   --garder-son           conserve le son des videos (supprime par defaut)
//   --filigrane "<png>"    utilise un autre filigrane (defaut : public/filigrane.png)
//
// CONSEIL : conservez vos fichiers originaux (ils portent la date et les donnees
// de prise de vue, utiles comme preuve de paternite).
// ============================================================

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ------------------------- REGLAGES (modifiables) -------------------------
const IMAGE_MAX_SIDE = 1600;   // cote le plus long des photos, en pixels
const IMAGE_QUALITY = 3;       // qualite JPEG ffmpeg : 2 (meilleure) a 31. 3 = tres bonne qualite
const VIDEO_MAX_LONG = 1280;   // cote le plus long des videos
const VIDEO_MAX_SHORT = 720;   // cote le plus court des videos (720p)
const VIDEO_CRF = 26;          // qualite H.264 : plus bas = meilleure qualite et fichier plus lourd (23-28 conseille)
const VIDEO_PRESET = "slow";   // "slow" = fichier plus leger mais encodage plus long ; "medium" = plus rapide

const DEFAULT_POSITION = "bas-gauche"; // "bas-gauche" ou "centre" (modifiable aussi avec --position)

// Filigrane en bas a gauche :
const WM_WIDTH_FRAC = 0.30;    // largeur du filigrane = 30 % de la largeur du media...
const WM_MIN_WIDTH = 220;      // ...mais jamais moins de 220 px (pour rester lisible sur les petites images)
const WM_MARGIN_FRAC = 0.03;   // distance au bord = 3 % du plus petit cote du media

// Filigrane au centre :
const WM_CENTER_WIDTH_FRAC = 0.34; // largeur = 34 % de la largeur du media
const WM_CENTER_Y = 0.66;          // position verticale du centre (0 = haut, 1 = bas)
// ---------------------------------------------------------------------------

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp"]);
const VIDEO_EXT = new Set([".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"]);
const UNSUPPORTED_EXT = new Set([".heic", ".heif", ".gif", ".tif", ".tiff"]);
const POSITIONS = new Set(["bas-gauche", "centre"]);

// ------------------------- outils -------------------------
function run(cmd, args) {
  return spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function toolAvailable(name) {
  const r = run(name, ["-version"]);
  return !r.error && r.status === 0;
}

function even(n) {
  return Math.max(2, 2 * Math.round(n / 2));
}

function size(bytes) {
  if (bytes < 1048576) return Math.max(1, Math.round(bytes / 1024)).toLocaleString("fr-FR") + " Ko";
  return (bytes / 1048576).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " Mo";
}

function slugify(text) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "dossier";
}

function probe(file) {
  const r = run("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height:stream_tags=rotate:stream_side_data=rotation",
    "-of", "json", file,
  ]);
  if (r.error || r.status !== 0) return null;
  try {
    const s = JSON.parse(r.stdout).streams[0];
    if (!s || !s.width || !s.height) return null;
    let rotation = 0;
    if (s.side_data_list) {
      const d = s.side_data_list.find((x) => x.rotation !== undefined);
      if (d) rotation = Number(d.rotation);
    }
    if (!rotation && s.tags && s.tags.rotate) rotation = Number(s.tags.rotate);
    return { width: s.width, height: s.height, rotation };
  } catch (e) {
    return null;
  }
}

// ------------------------- orientation EXIF des photos -------------------------
// ffmpeg n'applique pas l'orientation EXIF de la meme facon selon sa version.
// On la lit nous-memes et on desactive la rotation automatique : le resultat
// est identique quelle que soit la version de ffmpeg installee.
function readExifOrientation(file) {
  try {
    const fd = fs.openSync(file, "r");
    const buf = Buffer.alloc(131072);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    const b = buf.subarray(0, n);
    if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return 1;
    let off = 2;
    while (off + 4 <= b.length) {
      if (b[off] !== 0xff) return 1;
      const marker = b[off + 1];
      if (marker === 0xda || marker === 0xd9) return 1;
      const len = b.readUInt16BE(off + 2);
      if (marker === 0xe1 && b.toString("latin1", off + 4, off + 10) === "Exif\0\0") {
        const t = off + 10;
        const le = b.toString("latin1", t, t + 2) === "II";
        const u16 = (o) => (le ? b.readUInt16LE(o) : b.readUInt16BE(o));
        const u32 = (o) => (le ? b.readUInt32LE(o) : b.readUInt32BE(o));
        const ifd = t + u32(t + 4);
        const count = u16(ifd);
        for (let i = 0; i < count; i++) {
          const e = ifd + 2 + i * 12;
          if (u16(e) === 0x0112) {
            const v = u16(e + 8);
            return v >= 1 && v <= 8 ? v : 1;
          }
        }
        return 1;
      }
      off += 2 + len;
    }
  } catch (e) {
    // fichier illisible ou EXIF incomplet : on considere l'orientation normale
  }
  return 1;
}

const ORIENT_FILTER = {
  1: "", 2: "hflip,", 3: "hflip,vflip,", 4: "vflip,",
  5: "transpose=0,", 6: "transpose=1,", 7: "transpose=3,", 8: "transpose=2,",
};

// ------------------------- arguments -------------------------
const argv = process.argv.slice(2);
const opts = { source: null, sortie: null, filigrane: null, noWm: false, keepSound: false, position: DEFAULT_POSITION };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--sortie") opts.sortie = argv[++i];
  else if (a === "--filigrane") opts.filigrane = argv[++i];
  else if (a === "--position") opts.position = argv[++i];
  else if (a === "--sans-filigrane") opts.noWm = true;
  else if (a === "--garder-son") opts.keepSound = true;
  else if (!a.startsWith("--") && !opts.source) opts.source = a;
}

function fail(message) {
  console.error("\nERREUR : " + message);
  process.exit(1);
}

if (!opts.source) {
  fail('indiquez le dossier source. Exemple : node scripts/preparer-medias.mjs "C:\\Users\\RH5514\\Downloads\\Bagues"');
}
if (!POSITIONS.has(opts.position)) {
  fail('position inconnue : "' + opts.position + '". Valeurs possibles : bas-gauche, centre.');
}
const sourceDir = path.resolve(opts.source);
if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) fail("dossier introuvable : " + sourceDir);

if (!toolAvailable("ffmpeg") || !toolAvailable("ffprobe")) {
  fail("ffmpeg et ffprobe sont introuvables. Installez ffmpeg (https://ffmpeg.org/download.html), puis verifiez avec la commande : ffmpeg -version");
}

const outDir = path.resolve(opts.sortie || sourceDir + "_pour_le_site");
if (outDir === sourceDir) fail("le dossier de sortie doit etre different du dossier source.");

let wmPath = null;
let wmRatio = 0;
if (!opts.noWm) {
  wmPath = path.resolve(opts.filigrane || fileURLToPath(new URL("../public/filigrane.png", import.meta.url)));
  if (!fs.existsSync(wmPath)) fail("filigrane introuvable : " + wmPath + "\nPlacez filigrane.png dans le dossier public du projet, ou utilisez --sans-filigrane.");
  const wp = probe(wmPath);
  if (!wp) fail("filigrane illisible : " + wmPath);
  wmRatio = wp.height / wp.width;
}

// ------------------------- parcours des fichiers -------------------------
function walk(dir, list = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name.startsWith("$")) continue;
    const full = path.join(dir, entry.name);
    if (path.resolve(full) === outDir) continue; // ne retraite pas le dossier de sortie
    if (entry.isDirectory()) walk(full, list);
    else list.push(full);
  }
  return list;
}

// ------------------------- filigrane : taille et position -------------------------
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function overlayFor(outW, outH, evenSizes) {
  const centre = opts.position === "centre";
  let wmW = centre
    ? Math.round(outW * WM_CENTER_WIDTH_FRAC)
    : Math.round(Math.min(outW * 0.6, Math.max(outW * WM_WIDTH_FRAC, WM_MIN_WIDTH)));
  if (evenSizes) wmW = even(wmW);
  let wmH = Math.max(2, Math.round(wmW * wmRatio));
  if (evenSizes) wmH = even(wmH);

  let x;
  let y;
  if (centre) {
    x = Math.round((outW - wmW) / 2);
    y = Math.round(outH * WM_CENTER_Y - wmH / 2);
  } else {
    const margin = Math.round(WM_MARGIN_FRAC * Math.min(outW, outH));
    x = margin;
    y = outH - margin - wmH;
  }
  x = clamp(x, 0, Math.max(0, outW - wmW));
  y = clamp(y, 0, Math.max(0, outH - wmH));
  if (evenSizes) {
    x -= x % 2;
    y -= y % 2;
  }
  return { wmW, wmH, x, y };
}

// ------------------------- traitement d'une photo -------------------------
function processImage(src, dst) {
  const p = probe(src);
  if (!p) return { ok: false, reason: "image illisible" };
  const orientation = readExifOrientation(src);
  const swap = orientation >= 5;
  const dispW = swap ? p.height : p.width;
  const dispH = swap ? p.width : p.height;
  const scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(dispW, dispH));
  const outW = Math.max(1, Math.round(dispW * scale));
  const outH = Math.max(1, Math.round(dispH * scale));

  const base = `[0:v]${ORIENT_FILTER[orientation]}scale=${outW}:${outH}:flags=lanczos`;
  let fc;
  const args = ["-y", "-hide_banner", "-loglevel", "error", "-noautorotate", "-i", src];
  if (wmPath) {
    const o = overlayFor(outW, outH, false);
    args.push("-i", wmPath);
    fc = `${base}[b];[1:v]scale=${o.wmW}:${o.wmH}[w];[b][w]overlay=${o.x}:${o.y}:format=auto[out]`;
  } else {
    fc = `${base}[out]`;
  }
  args.push("-filter_complex", fc, "-map", "[out]", "-frames:v", "1", "-q:v", String(IMAGE_QUALITY),
    "-pix_fmt", "yuvj420p", "-map_metadata", "-1", dst);
  const r = run("ffmpeg", args);
  if (r.status !== 0 || !fs.existsSync(dst)) return { ok: false, reason: (r.stderr || "echec ffmpeg").trim().split("\n").pop() };
  return { ok: true, info: `${outW}x${outH}` };
}

// ------------------------- traitement d'une video -------------------------
function processVideo(src, dst) {
  const p = probe(src);
  if (!p) return { ok: false, reason: "video illisible" };
  const swap = Math.abs(p.rotation) % 180 === 90;
  const dispW = swap ? p.height : p.width;
  const dispH = swap ? p.width : p.height;
  const scale = Math.min(1, VIDEO_MAX_LONG / Math.max(dispW, dispH), VIDEO_MAX_SHORT / Math.min(dispW, dispH));
  const outW = even(dispW * scale);
  const outH = even(dispH * scale);

  const base = `[0:v]scale=${outW}:${outH}:flags=lanczos,setsar=1`;
  let fc;
  const args = ["-y", "-hide_banner", "-loglevel", "error", "-i", src];
  if (wmPath) {
    const o = overlayFor(outW, outH, true);
    args.push("-i", wmPath);
    fc = `${base}[b];[1:v]scale=${o.wmW}:${o.wmH}[w];[b][w]overlay=${o.x}:${o.y}:format=auto,format=yuv420p[out]`;
  } else {
    fc = `${base},format=yuv420p[out]`;
  }
  args.push("-filter_complex", fc, "-map", "[out]");
  if (opts.keepSound) args.push("-map", "0:a:0?", "-c:a", "aac", "-b:a", "96k");
  else args.push("-an");
  args.push("-c:v", "libx264", "-preset", VIDEO_PRESET, "-crf", String(VIDEO_CRF),
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-map_metadata", "-1", dst);
  const r = run("ffmpeg", args);
  if (r.status !== 0 || !fs.existsSync(dst)) return { ok: false, reason: (r.stderr || "echec ffmpeg").trim().split("\n").pop() };
  return { ok: true, info: `${outW}x${outH}` };
}

// ------------------------- programme principal -------------------------
console.log("Dossier source : " + sourceDir);
console.log("Dossier sortie : " + outDir);
console.log(wmPath ? `Filigrane      : ${wmPath} (${opts.position})` : "Filigrane      : aucun (--sans-filigrane)");
console.log(opts.keepSound ? "Son des videos : conserve" : "Son des videos : supprime");
console.log("");

const files = walk(sourceDir);
const used = new Set();
const results = { ok: [], failed: [], skipped: [], renamed: [] };
let totalBefore = 0;
let totalAfter = 0;

for (const file of files) {
  const ext = path.extname(file).toLowerCase();
  const isImage = IMAGE_EXT.has(ext);
  const isVideo = VIDEO_EXT.has(ext);
  const rel = path.relative(sourceDir, file);

  if (!isImage && !isVideo) {
    if (UNSUPPORTED_EXT.has(ext)) {
      results.skipped.push(`${rel}  (format ${ext} non pris en charge : convertissez-le en JPEG)`);
    }
    continue;
  }

  const relDir = path.dirname(rel);
  const outSub = relDir === "." ? [] : relDir.split(path.sep).map(slugify);
  const baseName = path.parse(file).name;
  const newExt = isImage ? ".jpg" : ".mp4";
  let target = path.join(outDir, ...outSub, baseName + newExt);
  let n = 2;
  while (used.has(target.toLowerCase())) {
    target = path.join(outDir, ...outSub, `${baseName}_${n++}${newExt}`);
  }
  used.add(target.toLowerCase());
  fs.mkdirSync(path.dirname(target), { recursive: true });

  const before = fs.statSync(file).size;
  process.stdout.write(`${isImage ? "PHOTO" : "VIDEO"}  ${rel} ... `);
  const r = isImage ? processImage(file, target) : processVideo(file, target);

  if (r.ok) {
    const after = fs.statSync(target).size;
    totalBefore += before;
    totalAfter += after;
    results.ok.push(rel);
    console.log(`OK (${size(before)} -> ${size(after)}, ${r.info})`);
    if (path.extname(file).toLowerCase() !== newExt) {
      results.renamed.push(`${rel}  ->  ${path.relative(outDir, target)}`);
    }
  } else {
    results.failed.push(`${rel}  (${r.reason})`);
    console.log("ECHEC : " + r.reason);
  }
}

console.log("\n================ BILAN ================");
console.log(`Fichiers traites : ${results.ok.length}   Echecs : ${results.failed.length}   Ignores : ${results.skipped.length}`);
if (results.ok.length > 0) {
  const gain = totalBefore > 0 ? Math.round((1 - totalAfter / totalBefore) * 100) : 0;
  console.log(`Poids total : ${size(totalBefore)} -> ${size(totalAfter)}  (${gain} % de moins)`);
}
if (results.renamed.length > 0) {
  console.log("\nFichiers dont le NOM a change (a reporter dans l'administration) :");
  results.renamed.forEach((x) => console.log("  - " + x));
}
if (results.skipped.length > 0) {
  console.log("\nFichiers ignores :");
  results.skipped.forEach((x) => console.log("  - " + x));
}
if (results.failed.length > 0) {
  console.log("\nFichiers en echec :");
  results.failed.forEach((x) => console.log("  - " + x));
}
console.log("\nLes originaux n'ont pas ete modifies.");
console.log("Copies pretes pour le site dans : " + outDir);
process.exit(results.failed.length > 0 ? 1 : 0);
