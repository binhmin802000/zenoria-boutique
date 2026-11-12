// Tests de la logique pure des variantes de medias (lib/mediaVariants.js).
// Lancer : node tests/mediaVariants.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {
  isStoragePath, isVariantPath, isVideoPath, thumbPath, posterPath, variantPaths,
  scaledSize, collectPhotoPaths, shouldAutoplayHero, THUMB_MAX_WIDTH,
} from "../lib/mediaVariants.js";

test("chemin Storage : dossier/fichier seulement", () => {
  assert.equal(isStoragePath("bleu-de-mer/1792013762881-IMG_1.jpg"), true);
  assert.equal(isStoragePath("feuilles d'automne/1792852958794-IMG_2.jpg"), true);
  assert.equal(isStoragePath("IMG_20250620_194129.jpg"), false); // ancien format local
  assert.equal(isStoragePath("https://exemple.fr/a/b.jpg"), false);
  assert.equal(isStoragePath(""), false);
  assert.equal(isStoragePath(null), false);
  assert.equal(isStoragePath(undefined), false);
  assert.equal(isStoragePath(42), false);
});

test("miniature : meme dossier, prefixe thumb_ devant le nom", () => {
  assert.equal(thumbPath("bleu-de-mer/1792013762881-IMG_1.jpg"), "bleu-de-mer/thumb_1792013762881-IMG_1.jpg");
  assert.equal(thumbPath("feuilles d'automne/1792-IMG_2.jpg"), "feuilles d'automne/thumb_1792-IMG_2.jpg");
  assert.equal(thumbPath("a/b/c.jpg"), "a/b/thumb_c.jpg");
});

test("miniature : aucune pour un ancien format, une variante, une video", () => {
  assert.equal(thumbPath("IMG_1.jpg"), null);
  assert.equal(thumbPath("https://x/y.jpg"), null);
  assert.equal(thumbPath("bleu/thumb_1-IMG.jpg"), null);
  assert.equal(thumbPath("bleu/poster_1-VID.jpg"), null);
  assert.equal(thumbPath("bleu/1794-VID_1.mp4"), null);
  assert.equal(thumbPath(null), null);
});

test("image fixe d'une video : poster_ + nom sans extension + .jpg", () => {
  assert.equal(posterPath("bleu-de-mer/1794183148652-VID_20250628_165912.mp4"), "bleu-de-mer/poster_1794183148652-VID_20250628_165912.jpg");
  assert.equal(posterPath("site/hero_video/1794-hero.webm"), "site/hero_video/poster_1794-hero.jpg");
  assert.equal(posterPath("site/hero_video/1794-HERO.MOV"), "site/hero_video/poster_1794-HERO.jpg");
});

test("image fixe : aucune pour une photo, un ancien format, une variante", () => {
  assert.equal(posterPath("bleu/1-IMG.jpg"), null);
  assert.equal(posterPath("VID.mp4"), null);
  assert.equal(posterPath("bleu/poster_1-VID.mp4"), null);
  assert.equal(posterPath(undefined), null);
});

test("detection des variantes et des videos", () => {
  assert.equal(isVariantPath("a/thumb_1.jpg"), true);
  assert.equal(isVariantPath("a/poster_1.jpg"), true);
  assert.equal(isVariantPath("a/1-thumb_x.jpg"), false);
  assert.equal(isVideoPath("a/1.mp4"), true);
  assert.equal(isVideoPath("a/1.jpg"), false);
});

test("suppression : le media et ses variantes, sans doublon ni null", () => {
  assert.deepEqual(variantPaths("a/1-x.jpg"), ["a/1-x.jpg", "a/thumb_1-x.jpg"]);
  assert.deepEqual(variantPaths("a/1-v.mp4"), ["a/1-v.mp4", "a/poster_1-v.jpg"]);
  assert.deepEqual(variantPaths("ancien.jpg"), ["ancien.jpg"]);
});

test("dimensions : reduit sans jamais agrandir, ratio conserve", () => {
  assert.deepEqual(scaledSize(1120, 900, 640), { width: 640, height: 514 });
  assert.deepEqual(scaledSize(448, 360, 640), { width: 448, height: 360 });
  assert.deepEqual(scaledSize(640, 640, 640), { width: 640, height: 640 });
  assert.deepEqual(scaledSize(4000, 1, 640), { width: 640, height: 1 });
  assert.equal(scaledSize(0, 10, 640), null);
  assert.equal(scaledSize("x", 10, 640), null);
  assert.equal(scaledSize(NaN, NaN, 640), null);
  assert.equal(THUMB_MAX_WIDTH, 640);
});

test("photos a traiter : sans doublon, sans ancien format, avec le dossier", () => {
  const products = [
    { slug: "violette", photos: ["IMG_193626.jpg", "violette/1791-IMG_193626.jpg"] },
    { slug: "rose", photos: ["rose/1-a.jpg", "rose/2-b.jpg", "rose/1-a.jpg"] },
    { slug: "x", photos: null },
    null,
  ];
  const r = collectPhotoPaths(products);
  assert.deepEqual(r.map((x) => x.path), ["violette/1791-IMG_193626.jpg", "rose/1-a.jpg", "rose/2-b.jpg"]);
  assert.equal(r[0].thumb, "violette/thumb_1791-IMG_193626.jpg");
  assert.equal(r[1].slug, "rose");
  assert.deepEqual(collectPhotoPaths(null), []);
});

test("video d'accueil : ordinateur normal = lecture automatique", () => {
  assert.equal(shouldAutoplayHero({ width: 1280 }), true);
  assert.equal(shouldAutoplayHero({ width: 768 }), true);
});

test("video d'accueil : mobile, economie de donnees, connexion lente = image fixe", () => {
  assert.equal(shouldAutoplayHero({ width: 375 }), false);
  assert.equal(shouldAutoplayHero({ width: 767 }), false);
  assert.equal(shouldAutoplayHero({ width: 1280, saveData: true }), false);
  assert.equal(shouldAutoplayHero({ width: 1280, effectiveType: "2g" }), false);
  assert.equal(shouldAutoplayHero({ width: 1280, effectiveType: "slow-2g" }), false);
  assert.equal(shouldAutoplayHero({ width: 1280, effectiveType: "4g" }), true);
});

test("video d'accueil : « reduire les animations » prime sur tout", () => {
  assert.equal(shouldAutoplayHero({ width: 1280, reducedMotion: true }), false);
  assert.equal(shouldAutoplayHero({ width: 375, reducedMotion: true, mobileAutoplay: true }), false);
});

test("video d'accueil : l'interrupteur admin retablit la lecture sur mobile, sans passer outre un choix de la visiteuse", () => {
  assert.equal(shouldAutoplayHero({ width: 375, mobileAutoplay: true }), true);
  assert.equal(shouldAutoplayHero({ width: 375, mobileAutoplay: false }), false);
  assert.equal(shouldAutoplayHero({ width: 375, saveData: true, mobileAutoplay: true }), false); // economie de donnees respectee
  assert.equal(shouldAutoplayHero({ width: 375, effectiveType: "2g", mobileAutoplay: true }), false);
  assert.equal(shouldAutoplayHero({ width: 375, reducedMotion: true, mobileAutoplay: true }), false);
});

test("video d'accueil : largeur inconnue = ordinateur (jamais de plantage)", () => {
  assert.equal(shouldAutoplayHero({}), true);
  assert.equal(shouldAutoplayHero({ width: undefined, saveData: undefined }), true);
});
