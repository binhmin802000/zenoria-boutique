import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function loadMediaUrl() {
  const file = new URL("../lib/mediaUrl.js", import.meta.url);
  let source = fs.readFileSync(file, "utf8");
  source = source
    .replace(/export function buildSupabaseMediaBaseUrl/, "function buildSupabaseMediaBaseUrl")
    .replace(/export function normalizePublicMediaBaseUrl/, "function normalizePublicMediaBaseUrl")
    .replace(/export function selectPublicMediaBaseUrl/, "function selectPublicMediaBaseUrl")
    .replace(/export function resolveMediaUrl/, "function resolveMediaUrl");
  source += "\nmodule.exports = { buildSupabaseMediaBaseUrl, normalizePublicMediaBaseUrl, selectPublicMediaBaseUrl, resolveMediaUrl };";
  const sandbox = { module: { exports: {} }, exports: {}, URL };
  vm.runInNewContext(source, sandbox, { filename: "lib/mediaUrl.js" });
  return sandbox.module.exports;
}

const { buildSupabaseMediaBaseUrl, normalizePublicMediaBaseUrl, selectPublicMediaBaseUrl, resolveMediaUrl } = loadMediaUrl();
const supabaseBase = buildSupabaseMediaBaseUrl("https://example.supabase.co/", "/product-media");
const r2Base = "https://pub-e9327412dd2046768ce6e627e7fdf42f.r2.dev";

assert.equal(supabaseBase, "https://example.supabase.co/storage/v1/object/public/product-media");
assert.equal(buildSupabaseMediaBaseUrl("", "product-media"), "");
assert.equal(buildSupabaseMediaBaseUrl("https://example.supabase.co", ""), "");

assert.equal(selectPublicMediaBaseUrl({ supabaseBaseUrl: supabaseBase, r2BaseUrl: r2Base }), supabaseBase);
assert.equal(selectPublicMediaBaseUrl({ provider: "supabase", supabaseBaseUrl: supabaseBase, r2BaseUrl: r2Base }), supabaseBase);
assert.equal(selectPublicMediaBaseUrl({ provider: "inconnu", supabaseBaseUrl: supabaseBase, r2BaseUrl: r2Base }), supabaseBase);

for (const invalidR2Url of [
  "", "http://media.example.test", "media.example.test", "javascript:alert(1)",
  "https://", "https://user:password@example.test", "https://example.test/?token=secret",
  "https://example.test/#fragment",
]) {
  assert.equal(
    selectPublicMediaBaseUrl({ provider: "r2", supabaseBaseUrl: supabaseBase, r2BaseUrl: invalidR2Url }),
    supabaseBase
  );
}

assert.equal(normalizePublicMediaBaseUrl(r2Base + "///"), r2Base);
assert.equal(selectPublicMediaBaseUrl({ provider: " R2 ", supabaseBaseUrl: supabaseBase, r2BaseUrl: r2Base + "///" }), r2Base);

assert.equal(resolveMediaUrl(null, "violette", supabaseBase), null);
assert.equal(resolveMediaUrl("", "violette", supabaseBase), null);
assert.equal(resolveMediaUrl("https://cdn.example/photo.jpg", "violette", r2Base), "https://cdn.example/photo.jpg");
assert.equal(resolveMediaUrl("http://cdn.example/photo.jpg", "violette", r2Base), "http://cdn.example/photo.jpg");
assert.equal(resolveMediaUrl("ancienne-photo.jpg", "violette", r2Base), "/images/violette/ancienne-photo.jpg");

for (const path of [
  "violette/1791741141789-IMG_20250620_193626.jpg",
  "violette/1794212104783-VID_20250620_140816.mp4",
  "violette/thumb_1791741141789-IMG_20250620_193626.jpg",
  "violette/poster_1794212104783-VID_20250620_140816.jpg",
  "site/hero_video/1700-video.mp4",
  "violette/photo%20rose.jpg",
]) {
  assert.equal(resolveMediaUrl(path, "violette", r2Base), r2Base + "/" + path);
}

assert.equal(resolveMediaUrl("violette/photo.jpg", "violette", ""), null);
console.log("mediaUrl.test.mjs : OK");
