// ZENORIA_MEDIA_VARIANTS_V1
// ============================================================
// Creation des variantes legeres DANS LE NAVIGATEUR (canvas) : miniature d'une photo, image fixe d'une video.
// Aucun acces au DOM au chargement du module (sans risque pour le rendu cote serveur de Next.js).
//
// Ces fonctions ne levent JAMAIS d'erreur : elles renvoient null si la variante ne peut pas etre creee (format non
// decodable, navigateur ancien...). Une variante ratee ne doit jamais empecher l'envoi du media d'origine.
// ============================================================
import { THUMB_MAX_WIDTH, POSTER_MAX_WIDTH, THUMB_QUALITY, POSTER_QUALITY, scaledSize } from "./mediaVariants";

function canvasToJpeg(canvas, quality) {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b && b.size > 0 ? b : null), "image/jpeg", quality);
    } catch (e) {
      resolve(null);
    }
  });
}

// Miniature JPEG d'une photo (Blob ou File). Largeur maximale THUMB_MAX_WIDTH, jamais agrandie.
export async function makeThumbBlob(blob, maxWidth = THUMB_MAX_WIDTH) {
  try {
    if (!blob || typeof createImageBitmap !== "function" || typeof document === "undefined") return null;
    const bmp = await createImageBitmap(blob);
    try {
      const size = scaledSize(bmp.width, bmp.height, maxWidth);
      if (!size) return null;
      const canvas = document.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.fillStyle = "#ffffff"; // les PNG transparents ne deviennent pas noirs en JPEG
      ctx.fillRect(0, 0, size.width, size.height);
      ctx.drawImage(bmp, 0, 0, size.width, size.height);
      return await canvasToJpeg(canvas, THUMB_QUALITY);
    } finally {
      if (typeof bmp.close === "function") bmp.close();
    }
  } catch (e) {
    return null;
  }
}

// Image fixe JPEG d'une video (Blob, File ou adresse lisible par le navigateur) : une image prise un peu apres le debut,
// pour eviter une image noire de fondu. Delai maximal de 8 s ; null au-dela ou en cas d'erreur.
export function makePosterBlob(source, { time = 0.4, maxWidth = POSTER_MAX_WIDTH, timeoutMs = 8000 } = {}) {
  return new Promise((resolve) => {
    let done = false;
    let url = "";
    let video = null;
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        if (video) {
          video.removeAttribute("src");
          video.load();
        }
        if (url) URL.revokeObjectURL(url);
      } catch (e) {
        // nettoyage sans importance
      }
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    try {
      if (!source || typeof document === "undefined") return finish(null);
      video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      video.crossOrigin = "anonymous";
      video.onerror = () => finish(null);
      video.onloadedmetadata = () => {
        const d = Number.isFinite(video.duration) ? video.duration : 0;
        const t = d > 0 ? Math.min(time, Math.max(0, d / 2)) : 0;
        try {
          video.currentTime = t;
        } catch (e) {
          finish(null);
        }
      };
      video.onseeked = async () => {
        try {
          const size = scaledSize(video.videoWidth, video.videoHeight, maxWidth);
          if (!size) return finish(null);
          const canvas = document.createElement("canvas");
          canvas.width = size.width;
          canvas.height = size.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) return finish(null);
          ctx.drawImage(video, 0, 0, size.width, size.height);
          finish(await canvasToJpeg(canvas, POSTER_QUALITY));
        } catch (e) {
          finish(null);
        }
      };
      if (typeof source === "string") {
        video.src = source;
      } else {
        url = URL.createObjectURL(source);
        video.src = url;
      }
    } catch (e) {
      finish(null);
    }
  });
}
