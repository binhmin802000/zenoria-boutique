import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function loadMediaUrl() {
  const file = new URL("../lib/mediaUrl.js", import.meta.url);
  let source = fs.readFileSync(file, "utf8");
  source = source
    .replace(/export function buildSupabaseMediaBaseUrl/, "function buildSupabaseMediaBaseUrl")
    .replace(/export function resolveMediaUrl/, "function resolveMediaUrl");
  source += "\nmodule.exports = { buildSupabaseMediaBaseUrl, resolveMediaUrl };";
  const sandbox = { module: { exports: {} }, exports: {} };
  vm.runInNewContext(source, sandbox, { filename: "lib/mediaUrl.js" });
  return sandbox.module.exports;
}

const { buildSupabaseMediaBaseUrl, resolveMediaUrl } = loadMediaUrl();
const base = buildSupabaseMediaBaseUrl("https://example.supabase.co/", "/product-media");
assert.equal(base, "https://example.supabase.co/storage/v1/object/public/product-media");
assert.equal(buildSupabaseMediaBaseUrl("", "product-media"), "");
assert.equal(buildSupabaseMediaBaseUrl("https://example.supabase.co", ""), "");
assert.equal(resolveMediaUrl(null, "violette", base), null);
assert.equal(resolveMediaUrl("", "violette", base), null);
assert.equal(resolveMediaUrl("https://cdn.example/photo.jpg", "violette", base), "https://cdn.example/photo.jpg");
assert.equal(resolveMediaUrl("http://cdn.example/photo.jpg", "violette", base), "http://cdn.example/photo.jpg");
assert.equal(resolveMediaUrl("violette/1700-photo.jpg", "violette", base), base + "/violette/1700-photo.jpg");
assert.equal(resolveMediaUrl("/violette/1700-photo.jpg", "violette", base), base + "/violette/1700-photo.jpg");
assert.equal(resolveMediaUrl("site/hero_video/1700-video.mp4", "site", base), base + "/site/hero_video/1700-video.mp4");
assert.equal(resolveMediaUrl("violette/thumb_1700-photo.jpg", "violette", base), base + "/violette/thumb_1700-photo.jpg");
assert.equal(resolveMediaUrl("site/hero_video/poster_1700-video.jpg", "site", base), base + "/site/hero_video/poster_1700-video.jpg");
assert.equal(resolveMediaUrl("ancienne-photo.jpg", "violette", base), "/images/violette/ancienne-photo.jpg");
assert.equal(resolveMediaUrl("violette/photo%20rose.jpg", "violette", base), base + "/violette/photo%20rose.jpg");
assert.equal(resolveMediaUrl("violette/photo.jpg", "violette", ""), null);
console.log("mediaUrl.test.mjs : OK");
