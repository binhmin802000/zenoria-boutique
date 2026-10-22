// Initialisation du client Supabase (authentification + base de donnees + stockage).
// Les cles sont lues depuis les variables d'environnement NEXT_PUBLIC_...
// definies dans le fichier .env.local (jamais commite sur GitHub).
import { createClient } from "@supabase/supabase-js";
import { prepareImageForWeb, WATERMARK_CIRCLE_URL } from "./prepareImage";
import { CIRCLE_PHOTO_MAX_SIDE } from "./cropMath";
import { observedFetch } from "./errorLogger";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// observedFetch signale au journal des erreurs (voir lib/errorLogger.js) les appels à Supabase qui
// échouent côté serveur (HTTP 5xx) ou côté réseau. Il ne change rien au fonctionnement du site.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, { global: { fetch: observedFetch } });

export const PRODUCT_MEDIA_BUCKET = "product-media";

// Poids maximal d'une video envoyee depuis /admin. Au-dela, la video doit d'abord
// etre preparee avec le script scripts/preparer-medias.mjs (720p, compression,
// filigrane). Une video preparee pese en general quelques Mo seulement.
export const MAX_VIDEO_MB = 25;

// ============================================================
// Resout un chemin enregistre en base de donnees vers une URL affichable.
// Trois cas possibles pour rester compatible avec les anciennes collections :
// 1. Une URL complete (http...)        -> renvoyee telle quelle
// 2. Un chemin contenant un "/"        -> fichier uploade depuis /admin,
//                                         stocke dans Supabase Storage
// 3. Un simple nom de fichier          -> ancien format : fichier depose
//                                         manuellement dans /public/images/<slug>/
// ============================================================
export function getMediaUrl(path, slug) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  if (path.includes("/")) {
    const { data } = supabase.storage.from(PRODUCT_MEDIA_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  }
  return `/images/${slug}/${path}`;
}

// Televerse une photo ou une video dans Supabase Storage, dans un dossier
// portant le nom de la collection (slug), avec un nom de fichier unique
// pour eviter tout risque d'ecrasement.
//  - PHOTOS : recadrees (si options.crop est fourni), redimensionnees, filigranees
//             et converties en JPEG avant l'envoi.
//             options.crop = { x, y, w, h } en fractions (0 a 1) de la photo.
//  - VIDEOS : refusees si elles depassent MAX_VIDEO_MB (voir plus haut).
export async function uploadProductMedia(file, slug, options = {}) {
  let toUpload = file;

  if (file.type.startsWith("image/")) {
    toUpload = await prepareImageForWeb(file, { crop: options.crop });
  } else if (file.type.startsWith("video/")) {
    const sizeMb = file.size / 1048576;
    if (sizeMb > MAX_VIDEO_MB) {
      throw new Error(
        "La video fait " + Math.round(sizeMb) + " Mo (maximum " + MAX_VIDEO_MB + " Mo). " +
          "Preparez-la d'abord avec le script scripts/preparer-medias.mjs (redimensionnement, compression, filigrane), puis envoyez la version preparee."
      );
    }
  }

  const cleanName = toUpload.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const path = `${slug}/${Date.now()}-${cleanName}`;
  const { error } = await supabase.storage.from(PRODUCT_MEDIA_BUCKET).upload(path, toUpload, {
    cacheControl: "31536000", // ZENORIA_CACHE_MEDIA_V1 : 1 an au lieu d'1 heure (quota "Cached Egress" Supabase)
    upsert: false,
    contentType: toUpload.type || undefined,
  });
  if (error) throw error;
  return path;
}

// Supprime un fichier du stockage. Ne fait rien pour les anciens formats
// (URL externe ou simple nom de fichier local), afin de ne jamais essayer
// de supprimer un fichier qui n'est pas dans Supabase Storage.
export async function deleteProductMedia(path) {
  if (!path || /^https?:\/\//i.test(path) || !path.includes("/")) return;
  try {
    await supabase.storage.from(PRODUCT_MEDIA_BUCKET).remove([path]);
  } catch (e) {
    // Suppression silencieuse : un echec ici ne doit jamais bloquer l'utilisateur.
  }
}

// ============================================================
// CONTENU DU SITE : video de la banniere d'accueil et photo de Savoir-faire
// (onglet « Contenu du site » de /admin, table public.site_media)
//
// Chaque emplacement ("slot") contient au plus UN media. Tant qu'un emplacement est
// vide, le site garde son comportement d'origine (media de la premiere collection).
// Les fichiers sont ranges dans Supabase Storage, dossier site/<emplacement>/.
// ============================================================
export const SITE_MEDIA_TABLE = "site_media";
export const SITE_SLOT_HERO_VIDEO = "hero_video";
export const SITE_SLOT_SAVOIR_FAIRE = "savoir_faire_photo";
export const SITE_SLOT_ACCOUNT_HERO = "account_hero"; // ZENORIA_ACCOUNT_STEP12_V1 : bandeau de l'espace cliente (/compte), format 21:9

// Televerse le media d'un emplacement.
//  - PHOTO : recadree en carre (options.crop), reduite a 1000 px, filigrane CENTRE tout en bas
//            (ombre renforcee), convertie en JPEG.
//  - VIDEO : deja traitee par la fenetre de cadrage (recadree, 720p, sans son, filigranee).
export async function uploadSiteMedia(file, slot, options = {}) {
  let toUpload = file;

  if (file.type.startsWith("image/")) {
    toUpload = await prepareImageForWeb(file, {
      crop: options.crop,
      position: "cercle",
      watermarkUrl: WATERMARK_CIRCLE_URL,
      maxSide: options.maxSide || CIRCLE_PHOTO_MAX_SIDE, // ZENORIA_ACCOUNT_STEP12_V1 : taille réglable (bandeau large)
    });
  } else if (file.type.startsWith("video/")) {
    const sizeMb = file.size / 1048576;
    if (sizeMb > MAX_VIDEO_MB) {
      throw new Error("La video fait " + Math.round(sizeMb) + " Mo (maximum " + MAX_VIDEO_MB + " Mo).");
    }
  }

  const cleanName = toUpload.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const path = `site/${slot}/${Date.now()}-${cleanName}`;
  const { error } = await supabase.storage.from(PRODUCT_MEDIA_BUCKET).upload(path, toUpload, {
    cacheControl: "31536000", // ZENORIA_CACHE_MEDIA_V1 : 1 an au lieu d'1 heure (quota "Cached Egress" Supabase)
    upsert: false,
    contentType: toUpload.type || undefined,
  });
  if (error) throw error;
  return path;
}

// Enregistre (ou remplace) le media d'un emplacement. Le suivi (qui, quand) est rempli par la base.
export function saveSiteMedia(slot, path) {
  return supabase.from(SITE_MEDIA_TABLE).upsert({ slot, path }, { onConflict: "slot" });
}

// Vide un emplacement : le site revient a son comportement d'origine.
export function clearSiteMedia(slot) {
  return supabase.from(SITE_MEDIA_TABLE).delete().eq("slot", slot);
}
