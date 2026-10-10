// ============================================================
// prepareImage.js - Prepare une photo avant son envoi depuis /admin
//
//  - applique l'orientation de la photo (EXIF) : une photo prise a la verticale
//    reste verticale
//  - recadre la photo selon le cadrage choisi dans la fenetre de cadrage
//    (sans cadrage : la photo entiere est conservee)
//  - reduit la taille (cote le plus long = 1600 px, jamais agrandie)
//  - ajoute le filigrane "(c) 2026 ZENORIA" (fichier public/filigrane.png)
//    en bas a gauche de la photo RECADREE
//  - enregistre en JPEG : les donnees EXIF (position GPS, appareil...) sont supprimees
//
// Les memes reglages que le script scripts/preparer-medias.mjs sont utilises,
// pour que toutes les photos du site aient le meme rendu.
// Le traitement se fait dans le navigateur : l'original n'est pas envoye.
// ============================================================

import { outputSize } from "./cropMath";

export const MAX_SIDE = 1600;   // cote le plus long, en pixels
const JPEG_QUALITY = 0.85;      // 0 a 1
const WATERMARK_URL = "/filigrane.png";

// Position du filigrane : "bas-gauche" (par defaut) ou "centre".
const DEFAULT_POSITION = "bas-gauche";

// Filigrane en bas a gauche :
const WM_WIDTH_FRAC = 0.30;     // largeur = 30 % de la largeur de l'image...
const WM_MIN_WIDTH = 220;       // ...mais jamais moins de 220 px
const WM_MARGIN_FRAC = 0.03;    // distance au bord = 3 % du plus petit cote

// Filigrane au centre :
const WM_CENTER_WIDTH_FRAC = 0.34;
const WM_CENTER_Y = 0.66;       // position verticale du centre (0 = haut, 1 = bas)

const watermarkCache = new Map();

export async function loadWatermarkBitmap(url = WATERMARK_URL) {
  if (!watermarkCache.has(url)) {
    const promise = fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error("introuvable");
        return response.blob();
      })
      .then((blob) => createImageBitmap(blob))
      .catch(() => {
        watermarkCache.delete(url); // on pourra reessayer plus tard
        throw new Error(
          "Le filigrane (" + url + ") est introuvable. Placez le fichier filigrane.png dans le dossier public du site."
        );
      });
    watermarkCache.set(url, promise);
  }
  return watermarkCache.get(url);
}

// Decode la photo avec son orientation (EXIF) appliquee.
export async function decodeImage(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch (first) {
    try {
      return await createImageBitmap(file);
    } catch (second) {
      throw new Error(
        "La photo « " + file.name + " » n'a pas pu etre lue (format non pris en charge, par exemple HEIC). Convertissez-la en JPEG."
      );
    }
  }
}

// Calcule la taille et la position du filigrane sur une image de width x height.
export function watermarkBox(width, height, wm, position) {
  const centre = position === "centre";
  const wmW = Math.max(
    2,
    Math.round(
      centre
        ? width * WM_CENTER_WIDTH_FRAC
        : Math.min(width * 0.6, Math.max(width * WM_WIDTH_FRAC, WM_MIN_WIDTH))
    )
  );
  const wmH = Math.max(2, Math.round((wmW * wm.height) / wm.width));
  let x;
  let y;
  if (centre) {
    x = Math.round((width - wmW) / 2);
    y = Math.round(height * WM_CENTER_Y - wmH / 2);
  } else {
    const margin = Math.round(WM_MARGIN_FRAC * Math.min(width, height));
    x = margin;
    y = height - margin - wmH;
  }
  x = Math.max(0, Math.min(width - wmW, x));
  y = Math.max(0, Math.min(height - wmH, y));
  return { x, y, wmW, wmH };
}

function validCrop(crop) {
  return (
    crop &&
    [crop.x, crop.y, crop.w, crop.h].every((v) => typeof v === "number" && Number.isFinite(v)) &&
    crop.w > 0 &&
    crop.h > 0
  );
}

// Dessine la photo recadree (+ filigrane) dans un canvas.
//  - crop : { x, y, w, h } en fractions (0 a 1) de la photo, ou rien pour la photo entiere
//  - options.previewWidth : si indique, le canvas est une version reduite a cette
//    largeur (le filigrane garde alors les memes proportions que dans le fichier final)
export function renderPhoto(bitmap, crop, wm, options = {}) {
  const maxSide = options.maxSide || MAX_SIDE;
  const position = options.position === "centre" ? "centre" : DEFAULT_POSITION;
  const c = validCrop(crop) ? crop : { x: 0, y: 0, w: 1, h: 1 };

  const sx = Math.max(0, Math.min(bitmap.width - 1, c.x * bitmap.width));
  const sy = Math.max(0, Math.min(bitmap.height - 1, c.y * bitmap.height));
  const sw = Math.max(1, Math.min(bitmap.width - sx, c.w * bitmap.width));
  const sh = Math.max(1, Math.min(bitmap.height - sy, c.h * bitmap.height));

  const out = outputSize(sw, sh, maxSide);
  const k = options.previewWidth ? options.previewWidth / out.width : 1;
  const width = Math.max(1, Math.round(out.width * k));
  const height = Math.max(1, Math.round(out.height * k));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff"; // fond blanc : le JPEG ne gere pas la transparence
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, width, height);

  if (wm) {
    const box = watermarkBox(out.width, out.height, wm, position);
    ctx.drawImage(wm, box.x * k, box.y * k, box.wmW * k, box.wmH * k);
  }
  return canvas;
}

export async function prepareImageForWeb(file, options = {}) {
  const maxSide = options.maxSide || MAX_SIDE;
  const quality = options.quality || JPEG_QUALITY;
  const withWatermark = options.watermark !== false;
  const watermarkUrl = options.watermarkUrl || WATERMARK_URL;
  const position = options.position === "centre" ? "centre" : DEFAULT_POSITION;

  // Les formats qui ne sont pas des photos classiques sont laisses tels quels.
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.type === "image/svg+xml") {
    return file;
  }

  // On charge le filigrane en premier : s'il manque, on le dit avant tout traitement.
  const wm = withWatermark ? await loadWatermarkBitmap(watermarkUrl) : null;

  const bitmap = await decodeImage(file);
  const canvas = renderPhoto(bitmap, options.crop, wm, { maxSide, position });
  if (bitmap.close) bitmap.close();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("La conversion de la photo a echoue.");

  const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
  return new File([blob], baseName + ".jpg", { type: "image/jpeg" });
}
