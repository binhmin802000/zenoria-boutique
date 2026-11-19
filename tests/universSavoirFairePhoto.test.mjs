import assert from "node:assert/strict";
import fs from "node:fs";
const index = fs.readFileSync(new URL("../pages/index.js", import.meta.url), "utf8");
const admin = fs.readFileSync(new URL("../components/AdminSiteMedia.js", import.meta.url), "utf8");
const indexTerms = [
  "siteMedia.account_hero?.path",
  'getMediaUrl(siteMedia.account_hero.path, "site")',
  'data-testid="univers-savoir-faire-photo"',
  'alt=""',
  'loading="lazy"',
  "onError={() => setUniversSavoirFairePhotoFailed(true)}",
  "bg-gradient-to-b",
  "group-hover:scale-[1.04]",
  "active:scale-[0.985]",
  "motion-reduce:transform-none",
  'scrollToSection("savoir-faire")',
  "bg-[#f5edf1]",
];
for (const term of indexTerms) assert.equal(index.includes(term), true, term);
assert.equal(index.includes("supabase.co/storage/v1/"), false);
assert.equal(admin.includes("fond de la carte « Notre savoir-faire »"), true);
assert.equal(admin.includes("conserve son fond rose"), true);
console.log("universSavoirFairePhoto.test.mjs : OK");
