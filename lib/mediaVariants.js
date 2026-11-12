// ZENORIA_MEDIA_VARIANTS_V1
// ============================================================
// VARIANTES LEGERES DES MEDIAS (logique pure : aucun React, aucun DOM, aucun reseau)
//
// Une photo de bijou envoyee depuis /admin est rangee dans Supabase Storage sous « <slug>/<horodatage>-<nom>.jpg ».
// On y ajoute, au televersement, deux fichiers derives qui se deduisent TOUJOURS du chemin d'origine :
//   - miniature d'une photo : « <slug>/thumb_<horodatage>-<nom>.jpg »   (listes, panier, favoris, quiz)
//   - image fixe d'une video : « <dossier>/poster_<horodatage>-<nom>.jpg » (video d'accueil sur mobile)
// Aucune colonne en base : le chemin d'une variante se calcule, il ne se stocke pas.
//
// Anciens formats (URL complete, simple nom de fichier du dossier public/images) : pas de variante, la
// fonction renvoie null et le site utilise l'original.
// ============================================================
export const THUMB_PREFIX = "thumb_";
export const POSTER_PREFIX = "poster_";
export const THUMB_MAX_WIDTH = 640;
export const POSTER_MAX_WIDTH = 720;
export const THUMB_QUALITY = 0.8;
export const POSTER_QUALITY = 0.82;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v)$/i;

// Chemin enregistre dans Supabase Storage (« dossier/fichier »), et non URL complete ni ancien nom local.
export function isStoragePath(path) {
  return typeof path === "string" && path.length > 2 && !/^https?:\/\//i.test(path) && path.includes("/");
}

function splitPath(path) {
  const i = path.lastIndexOf("/");
  return { dir: path.slice(0, i), base: path.slice(i + 1) };
}

export function isVariantPath(path) {
  if (!isStoragePath(path)) return false;
  const { base } = splitPath(path);
  return base.startsWith(THUMB_PREFIX) || base.startsWith(POSTER_PREFIX);
}

export function isVideoPath(path) {
  return isStoragePath(path) && VIDEO_EXT.test(path);
}

// Miniature d'une photo, ou null (ancien format, variante elle-meme, video).
export function thumbPath(path) {
  if (!isStoragePath(path) || isVariantPath(path) || isVideoPath(path)) return null;
  const { dir, base } = splitPath(path);
  return dir + "/" + THUMB_PREFIX + base;
}

// Image fixe d'une video, ou null (pas une video, ancien format).
export function posterPath(path) {
  if (!isVideoPath(path) || isVariantPath(path)) return null;
  const { dir, base } = splitPath(path);
  return dir + "/" + POSTER_PREFIX + base.replace(VIDEO_EXT, "") + ".jpg";
}

// Tous les fichiers a supprimer avec un media : lui-meme et ses variantes eventuelles.
export function variantPaths(path) {
  const out = [path];
  const t = thumbPath(path);
  const p = posterPath(path);
  if (t) out.push(t);
  if (p) out.push(p);
  return out;
}

// Dimensions d'une variante : jamais agrandie, ratio conserve, entiers >= 1.
export function scaledSize(width, height, maxWidth) {
  const w = Number(width);
  const h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  const k = w > maxWidth ? maxWidth / w : 1;
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

// Photos d'une liste de bijoux qui meritent une miniature, sans doublon, avec leur dossier.
// products : [{ slug, photos: [...] }]
export function collectPhotoPaths(products) {
  const seen = new Set();
  const out = [];
  (Array.isArray(products) ? products : []).forEach((p) => {
    const photos = p && Array.isArray(p.photos) ? p.photos : [];
    photos.forEach((path) => {
      if (!thumbPath(path) || seen.has(path)) return;
      seen.add(path);
      out.push({ path, thumb: thumbPath(path), slug: p.slug || "" });
    });
  });
  return out;
}

// La visiteuse doit-elle voir la video d'accueil se lancer automatiquement ?
// Image fixe (avec un bouton ▶) dans ces cas, sans exception :
//   - « reduire les animations » active ; economie de donnees active ; connexion 2G.
// Image fixe aussi sur ecran etroit (< 768 px), SAUF si l'administration a active la lecture automatique sur mobile.
// L'interrupteur de l'administration ne passe donc jamais outre un choix explicite de la visiteuse.
export function shouldAutoplayHero({ width, saveData, effectiveType, reducedMotion, mobileAutoplay }) {
  if (reducedMotion === true) return false;
  if (saveData === true) return false;
  if (effectiveType === "slow-2g" || effectiveType === "2g") return false;
  const w = Number(width);
  if (mobileAutoplay !== true && Number.isFinite(w) && w > 0 && w < 768) return false;
  return true;
}
