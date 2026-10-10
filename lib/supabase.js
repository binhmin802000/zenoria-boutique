// Initialisation du client Supabase (authentification + base de donnees + stockage).
// Les cles sont lues depuis les variables d'environnement NEXT_PUBLIC_...
// definies dans le fichier .env.local (jamais commite sur GitHub).
import { createClient } from "@supabase/supabase-js";
import { prepareImageForWeb } from "./prepareImage";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
    cacheControl: "3600",
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
