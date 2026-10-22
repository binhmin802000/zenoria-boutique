// ============================================================
// cropMath.js - Calculs du cadrage des photos et des videos (aucune dependance)
//
// Le cadre de reference est celui de la FICHE PRODUIT du site sur ordinateur :
// 448 x 360 pixels (voir ProductMedia dans pages/index.js : colonne de 448 px
// de large, hauteur fixe h-[360px]).
//
// La photo ou la video enregistree a exactement ce rapport largeur/hauteur. Le
// site la recadre ensuite (object-cover, centre) dans les autres vues : carte du
// catalogue, fiche sur mobile, cercles.
// ============================================================

export const FRAME_WIDTH = 448;
export const FRAME_HEIGHT = 360;
export const FRAME_ASPECT = FRAME_WIDTH / FRAME_HEIGHT;

export const MAX_ZOOM = 4; // zoom maximal : 400 %

// En dessous de cette largeur (en pixels de la photo d'origine), le recadrage
// est affiche a 448 px sur un ecran haute definition (x2) avec moins de pixels
// que necessaire : l'image risque d'etre floue.
export const MIN_SOURCE_WIDTH_WARN = FRAME_WIDTH * 2;

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Plus grand rectangle de rapport "aspect" qui tient dans l'image.
export function maxCropSize(imgW, imgH, aspect = FRAME_ASPECT) {
  let w = imgW;
  let h = w / aspect;
  if (h > imgH) {
    h = imgH;
    w = h * aspect;
  }
  return { w, h };
}

// Rectangle de recadrage (en pixels de la photo) pour un zoom et un centre donnes.
// Le rectangle reste toujours entierement dans la photo.
export function cropRect(imgW, imgH, aspect, zoom, cx, cy) {
  const max = maxCropSize(imgW, imgH, aspect);
  const z = clamp(zoom, 1, MAX_ZOOM);
  const w = max.w / z;
  const h = max.h / z;
  const x = clamp(cx - w / 2, 0, Math.max(0, imgW - w));
  const y = clamp(cy - h / 2, 0, Math.max(0, imgH - h));
  return { x, y, w, h };
}

// Rectangle en fractions (0 a 1) de la photo : independant de la resolution.
export function toFractions(rect, imgW, imgH) {
  return { x: rect.x / imgW, y: rect.y / imgH, w: rect.w / imgW, h: rect.h / imgH };
}

// Taille du fichier enregistre : cote le plus long limite a maxSide, jamais agrandi.
export function outputSize(cropW, cropH, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(cropW, cropH));
  return {
    width: Math.max(1, Math.round(cropW * scale)),
    height: Math.max(1, Math.round(cropH * scale)),
    scale,
  };
}

// Part (0 a 1) du filigrane encore visible quand la photo enregistree (outW x outH)
// est affichee dans une vue viewW x viewH avec le recadrage "object-cover" centre
// du site. "box" = position du filigrane dans le fichier : { x, y, wmW, wmH }.
export function visibleFraction(box, outW, outH, viewW, viewH, circle = false, n = 48) {
  const s = Math.max(viewW / outW, viewH / outH);
  const offX = (outW * s - viewW) / 2;
  const offY = (outH * s - viewH) / 2;
  let seen = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const px = (box.x + ((i + 0.5) * box.wmW) / n) * s - offX;
      const py = (box.y + ((j + 0.5) * box.wmH) / n) * s - offY;
      let inside = px >= 0 && px < viewW && py >= 0 && py < viewH;
      if (inside && circle) {
        inside = (px - viewW / 2) ** 2 + (py - viewH / 2) ** 2 <= (viewW / 2) ** 2;
      }
      if (inside) seen++;
    }
  }
  return seen / (n * n);
}

// ============================================================
// VIDEOS
// ============================================================

// Duree maximale d'une video traitee depuis /admin. Le traitement se fait en temps
// reel (une video de 60 s demande environ 60 s), et une video produit plus longue
// pese vite plus de 25 Mo.
export const MAX_VIDEO_SECONDS = 60;

export const VIDEO_MAX_LONG = 1280;  // cote le plus long, en pixels
export const VIDEO_MAX_SHORT = 720;  // cote le plus court, en pixels (720p)

// Taille de la video enregistree : 720p au maximum, jamais agrandie, dimensions
// paires (obligatoire pour la video H.264).
export function videoOutputSize(cropW, cropH) {
  const scale = Math.min(1, VIDEO_MAX_LONG / Math.max(cropW, cropH), VIDEO_MAX_SHORT / Math.min(cropW, cropH));
  const even = (n) => Math.max(2, 2 * Math.round(n / 2));
  return { width: even(cropW * scale), height: even(cropH * scale), scale };
}

// Debit de la video (bits par seconde) selon sa taille : environ 2 Mbit/s en 896 x 720.
export function videoBitrate(width, height, fps = 30) {
  return Math.round(clamp(width * height * fps * 0.11, 1500000, 5000000));
}

// ============================================================
// CADRE CIRCULAIRE : video de la banniere d'accueil et photo de la section Savoir-faire
//
// Ces deux visuels sont affiches dans un CERCLE. Le cadre de cadrage est donc un
// CARRE (1:1) : le site le decoupe en cercle, et le filigrane est place au centre,
// le plus bas possible sans que ses coins soient coupes par la courbure du cercle.
// ============================================================
export const CIRCLE_ASPECT = 1;
export const CIRCLE_FRAME_SIZE = 380;       // cote du cadre carre affiche dans la fenetre de cadrage
export const CIRCLE_PHOTO_MAX_SIDE = 1000;  // photo de Savoir-faire : 1000 px suffisent pour un cercle de 380 px
export const HERO_VIDEO_MAX_SECONDS = 20; // ZENORIA_CACHE_MEDIA_V1 : limite réduite (poids/egress), modifiable à tout moment   // video de la banniere : courte, car elle se charge a chaque visite

export const CIRCLE_WM_WIDTH_FRAC = 0.30;   // largeur du filigrane = 30 % du diametre du cercle
export const CIRCLE_WM_MARGIN_FRAC = 0.02;  // marge de securite entre les coins du filigrane et le bord du cercle
export const CIRCLE_WM_MIN_WIDTH = 160;     // largeur minimale (pixels), pour rester lisible sur une petite image

// Position du filigrane dans une image carree (ou presque) affichee en cercle :
// centre horizontalement, aussi bas que possible, les deux coins du bas restant a
// CIRCLE_WM_MARGIN_FRAC du bord du cercle. wmRatio = hauteur / largeur du filigrane.
export function circleWatermarkBox(width, height, wmRatio) {
  const d = Math.min(width, height);
  const wmW = Math.round(Math.min(d * 0.5, Math.max(d * CIRCLE_WM_WIDTH_FRAC, CIRCLE_WM_MIN_WIDTH)));
  const wmH = Math.max(2, Math.round(wmW * wmRatio));
  const r = d / 2 - d * CIRCLE_WM_MARGIN_FRAC;               // rayon utile, marge comprise
  const half = wmW / 2;
  const below = Math.sqrt(Math.max(r * r - half * half, 0)); // du centre jusqu'aux coins du bas
  const x = clamp(Math.round(width / 2 - half), 0, Math.max(0, width - wmW));
  const y = clamp(Math.round(height / 2 + below - wmH), 0, Math.max(0, height - wmH));
  return { x, y, wmW, wmH };
}
