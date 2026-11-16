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
