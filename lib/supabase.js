// Initialisation du client Supabase (authentification + base de données + stockage).
// Les clés sont lues depuis les variables d'environnement NEXT_PUBLIC_...
// définies dans le fichier .env.local (jamais commité sur GitHub).
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const PRODUCT_MEDIA_BUCKET = "product-media";

// ============================================================
// Résout un chemin enregistré en base de données vers une URL affichable.
// Trois cas possibles pour rester compatible avec les anciennes collections :
// 1. Une URL complète (http...)        -> renvoyée telle quelle
// 2. Un chemin contenant un "/"        -> fichier uploadé depuis /admin,
//                                         stocké dans Supabase Storage
// 3. Un simple nom de fichier          -> ancien format : fichier déposé
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

// Téléverse une photo ou une vidéo dans Supabase Storage, dans un dossier
// portant le nom de la collection (slug), avec un nom de fichier unique
// pour éviter tout risque d'écrasement.
export async function uploadProductMedia(file, slug) {
  const cleanName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const path = `${slug}/${Date.now()}-${cleanName}`;
  const { error } = await supabase.storage.from(PRODUCT_MEDIA_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
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
    // Suppression silencieuse : un échec ici ne doit jamais bloquer l'utilisateur.
  }
}
