// Initialisation du client Supabase (authentification + base de donnees + stockage).
// Les cles sont lues depuis les variables d'environnement NEXT_PUBLIC_...
// definies dans le fichier .env.local (jamais commite sur GitHub).
import { createClient } from "@supabase/supabase-js";
import { prepareImageForWeb, WATERMARK_CIRCLE_URL } from "./prepareImage";
import { CIRCLE_PHOTO_MAX_SIDE } from "./cropMath";
import { observedFetch } from "./errorLogger";
import { thumbPath, posterPath, variantPaths } from "./mediaVariants"; // ZENORIA_MEDIA_VARIANTS_V1
import { makeThumbBlob, makePosterBlob } from "./mediaVariantsBrowser"; // ZENORIA_MEDIA_VARIANTS_V1
import { buildSupabaseMediaBaseUrl, resolveMediaUrl, selectPublicMediaBaseUrl } from "./mediaUrl"; // ZENORIA_MEDIA_URL_V1

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const publicMediaProvider = process.env.NEXT_PUBLIC_MEDIA_PROVIDER;
const r2PublicBaseUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL; // ZENORIA_R2_PUBLIC_PROVIDER_V1

// observedFetch signale au journal des erreurs (voir lib/errorLogger.js) les appels à Supabase qui
// échouent côté serveur (HTTP 5xx) ou côté réseau. Il ne change rien au fonctionnement du site.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, { global: { fetch: observedFetch } });

export const PRODUCT_MEDIA_BUCKET = "product-media";
export const PRODUCT_MEDIA_SUPABASE_BASE_URL = buildSupabaseMediaBaseUrl(
  supabaseUrl,
  PRODUCT_MEDIA_BUCKET
); // ZENORIA_MEDIA_URL_V1

export const PRODUCT_MEDIA_PUBLIC_BASE_URL = selectPublicMediaBaseUrl({
  provider: publicMediaProvider,
  supabaseBaseUrl: PRODUCT_MEDIA_SUPABASE_BASE_URL,
  r2BaseUrl: r2PublicBaseUrl,
}); // ZENORIA_R2_PUBLIC_PROVIDER_V1

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
  return resolveMediaUrl(path, slug, PRODUCT_MEDIA_PUBLIC_BASE_URL);
}

// ZENORIA_MEDIA_VARIANTS_V1 : variantes legeres des medias (miniature d'une photo, image fixe d'une video), deduites du chemin d'origine
// Adresse de la miniature d'une photo. Sans miniature possible (ancien format), renvoie l'adresse de l'original.
export function getThumbUrl(path, slug) {
  const t = thumbPath(path);
  return t ? getMediaUrl(t, slug) : getMediaUrl(path, slug);
}

// Adresse de l'image fixe d'une video, ou null si elle n'a pas d'image fixe (ancien format).
export function getPosterUrl(path, slug) {
  const p = posterPath(path);
  return p ? getMediaUrl(p, slug) : null;
}

// ZENORIA_R2_UPLOAD_SYNC_V1
// Synchronise vers R2 chaque objet cree pendant un televersement admin.
// Le chemin n'est retourne au composant qu'apres validation complete de R2.
async function syncUploadedPathsToR2(paths) {
  const uniquePaths = [...new Set(paths.filter(Boolean))];

  if (uniquePaths.length < 1 || uniquePaths.length > 5) {
    throw new Error(
      "La liste des medias a synchroniser vers R2 est invalide."
    );
  }

  const { data, error: sessionError } =
    await supabase.auth.getSession();

  const accessToken = data?.session?.access_token;

  if (sessionError || !accessToken) {
    throw new Error(
      "Session administratrice introuvable pour la synchronisation R2."
    );
  }

  const response = await fetch("/api/admin/r2/sync-paths", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      paths: uniquePaths,
      optionalPaths: [],
    }),
  });

  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (
    !response.ok ||
    !payload?.ok ||
    !Array.isArray(payload.results)
  ) {
    throw new Error(
      payload?.error || "Synchronisation R2 impossible."
    );
  }

  const acceptedStatuses = new Set([
    "COPIED_OK",
    "SKIP_OK",
  ]);

  const resultsByPath = new Map(
    payload.results.map((item) => [item?.path, item])
  );

  const failedPaths = uniquePaths.filter((mediaPath) => {
    const result = resultsByPath.get(mediaPath);

    return (
      !result ||
      !acceptedStatuses.has(result.status)
    );
  });

  if (failedPaths.length > 0) {
    throw new Error(
      "Synchronisation R2 incomplete pour : " +
        failedPaths.join(", ")
    );
  }

  return payload;
}

// ZENORIA_R2_DELETE_SYNC_V1
// Supprime des objets dans R2 via la route serveur. Ne leve jamais d'exception.
async function deleteR2Paths(paths) {
  const uniquePaths = [...new Set((paths || []).filter(Boolean))];
  if (!uniquePaths.length) return { ok: true };

  try {
    const { data, error: sessionError } = await supabase.auth.getSession();
    const accessToken = data?.session?.access_token;

    if (sessionError || !accessToken) {
      return { ok: false, error: "Session administratrice introuvable pour la suppression R2." };
    }

    const accepted = new Set(["DELETED_OK", "ABSENT_OK"]);

    for (let i = 0; i < uniquePaths.length; i += 5) {
      const chunk = uniquePaths.slice(i, i + 5);

      const response = await fetch("/api/admin/r2/delete-paths", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ paths: chunk }),
      });

      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok || !payload?.ok || !Array.isArray(payload.results)) {
        return { ok: false, error: payload?.error || "Suppression R2 impossible." };
      }

      const failedPaths = chunk.filter((mediaPath) => {
        const result = payload.results.find((item) => item?.path === mediaPath);
        return !result || !accepted.has(result.status);
      });

      if (failedPaths.length > 0) {
        return { ok: false, error: "Suppression R2 incomplete pour : " + failedPaths.join(", ") };
      }
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Suppression R2 impossible.",
    };
  }
}

async function cleanupNewSupabasePaths(paths) {
  const uniquePaths = [...new Set(paths.filter(Boolean))];

  if (!uniquePaths.length) return null;

  let cleanupError = null;

  // Une copie R2 a pu etre creee avant l'echec : on la retire aussi.
  const r2Result = await deleteR2Paths(uniquePaths);
  if (!r2Result.ok) cleanupError = new Error(r2Result.error);

  try {
    const { error } = await supabase.storage
      .from(PRODUCT_MEDIA_BUCKET)
      .remove(uniquePaths);

    if (error && !cleanupError) cleanupError = error;
  } catch (error) {
    if (!cleanupError) cleanupError = error;
  }

  return cleanupError;
}

// Envoie l'original et sa variante dans Supabase,
// puis valide leurs copies dans R2.
async function uploadWithVariants(path, blob, opts) {
  const createdPaths = [];

  const originalResult = await supabase.storage
    .from(PRODUCT_MEDIA_BUCKET)
    .upload(path, blob, opts);

  if (originalResult.error) {
    return originalResult;
  }

  createdPaths.push(path);

  try {
    const type = (blob && blob.type) || "";
    let variant = null;
    let target = null;

    if (
      type.startsWith("image/") &&
      !path.startsWith("site/")
    ) {
      target = thumbPath(path);

      if (target) {
        variant = await makeThumbBlob(blob);
      }
    } else if (type.startsWith("video/")) {
      target = posterPath(path);

      if (target) {
        variant = await makePosterBlob(blob);
      }
    }

    if (target) {
      if (!variant) {
        throw new Error(
          "La variante du media n'a pas pu etre creee."
        );
      }

      const variantResult = await supabase.storage
        .from(PRODUCT_MEDIA_BUCKET)
        .upload(target, variant, {
          cacheControl: "31536000",
          upsert: false,
          contentType: "image/jpeg",
        });

      if (variantResult.error) {
        throw variantResult.error;
      }

      createdPaths.push(target);
    }

    await syncUploadedPathsToR2(createdPaths);

    return originalResult;
  } catch (error) {
    const cleanupError =
      await cleanupNewSupabasePaths(createdPaths);

    const initialMessage =
      error instanceof Error
        ? error.message
        : "Synchronisation R2 impossible.";

    const cleanupMessage = cleanupError
      ? " Le nettoyage Supabase doit etre controle."
      : "";

    return {
      data: null,
      error: new Error(initialMessage + cleanupMessage),
    };
  }
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
  const { error } = await uploadWithVariants(path, toUpload, { // ZENORIA_MEDIA_VARIANTS_V1
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
  if (!path || /^https?:\/\//i.test(path) || !path.includes("/")) {
    return { ok: true, skipped: true };
  }

  const paths = [...new Set(variantPaths(path).filter(Boolean))];

  // 1. R2 d'abord : le site lit les medias depuis R2.
  const r2Result = await deleteR2Paths(paths);
  if (!r2Result.ok) {
    // Supabase est conserve : les deux stockages restent coherents.
    console.warn("[deleteProductMedia] suppression R2 incomplete, Supabase conserve :", r2Result.error);
    return { ok: false, r2Failed: true, error: r2Result.error };
  }

  // 2. Supabase ensuite. Un echec ici ne doit jamais bloquer l'utilisateur.
  try {
    const { error } = await supabase.storage.from(PRODUCT_MEDIA_BUCKET).remove(paths); // ZENORIA_MEDIA_VARIANTS_V1 : le media et ses variantes
    if (error) {
      console.warn("[deleteProductMedia] suppression Supabase incomplete :", error.message);
      return { ok: false, supabaseFailed: true, error: error.message };
    }
  } catch (e) {
    console.warn("[deleteProductMedia] suppression Supabase impossible :", e && e.message);
    return { ok: false, supabaseFailed: true, error: (e && e.message) || "erreur inconnue" };
  }

  return { ok: true };
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
  const { error } = await uploadWithVariants(path, toUpload, { // ZENORIA_MEDIA_VARIANTS_V1
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
