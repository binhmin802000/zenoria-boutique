// ZENORIA_MEDIA_URL_V1
// Logique pure de resolution des medias. Aucun React, DOM ou acces reseau.

function trimTrailingSlashes(value) {
  return String(value || "").replace(/\/+$/, "");
}

function trimLeadingSlashes(value) {
  return String(value || "").replace(/^\/+/, "");
}

export function buildSupabaseMediaBaseUrl(supabaseUrl, bucket) {
  const origin = trimTrailingSlashes(supabaseUrl);
  const cleanBucket = trimLeadingSlashes(bucket);
  if (!origin || !cleanBucket) return "";
  return origin + "/storage/v1/object/public/" + cleanBucket;
}

// ZENORIA_R2_PUBLIC_PROVIDER_V1
// R2 n'est choisi que sur demande explicite et avec une base HTTPS valide.
// Toute configuration absente, inconnue ou invalide retombe sur Supabase.
export function normalizePublicMediaBaseUrl(value) {
  const candidate = trimTrailingSlashes(value);
  if (!candidate) return "";
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" || !url.hostname) return "";
    if (url.username || url.password || url.search || url.hash) return "";
    return trimTrailingSlashes(url.toString());
  } catch {
    return "";
  }
}

export function selectPublicMediaBaseUrl({
  provider,
  supabaseBaseUrl,
  r2BaseUrl,
} = {}) {
  const supabaseBase = trimTrailingSlashes(supabaseBaseUrl);
  const requestedProvider = String(provider || "").trim().toLowerCase();
  if (requestedProvider !== "r2") return supabaseBase;
  const r2Base = normalizePublicMediaBaseUrl(r2BaseUrl);
  return r2Base || supabaseBase;
}

export function resolveMediaUrl(mediaPath, slug, storageBaseUrl) {
  if (!mediaPath) return null;
  const value = String(mediaPath);
  if (/^https?:\/\//i.test(value)) return value;
  if (value.includes("/")) {
    const base = trimTrailingSlashes(storageBaseUrl);
    if (!base) return null;
    return base + "/" + trimLeadingSlashes(value);
  }
  return "/images/" + String(slug || "") + "/" + value;
}
