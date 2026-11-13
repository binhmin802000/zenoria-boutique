// ZENORIA_HERO_MOBILE_V1 : tests de lib/heroMobileSettings.js — lancer avec : node tests/heroMobileSettings.test.mjs
import assert from "node:assert/strict";
import {
  HERO_MOBILE_KEY, DEFAULT_HERO_MOBILE, DEFAULT_VISITS,
  parseHeroMobileSetting, isHeroMobileValueReadable, buildHeroMobileValue, sameHeroMobileSetting,
  heroMobileLabel, describeHeroMobileSetting, parseVisitsInput, splitStoragePath, sizeFromStorageList, heroPosterPath,
  estimateHeroEgress, formatMo, formatPercent, heroEgressSummary, heroMobileErrorMessage, isDuplicateKeyError,
} from "../lib/heroMobileSettings.js";
import { shouldAutoplayHero } from "../lib/mediaVariants.js";

let passed = 0;
function t(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (e) {
    console.error("ÉCHEC : " + name + "\n  " + (e && e.message ? e.message : e));
    process.exitCode = 1;
  }
}

t("clé et valeur par défaut", () => {
  assert.equal(HERO_MOBILE_KEY, "hero_mobile");
  assert.deepEqual(DEFAULT_HERO_MOBILE, { autoplay: false });
  assert.match(HERO_MOBILE_KEY, /^[a-z][a-z0-9_]{0,39}$/); // contrainte site_settings_key_format
});
t("lecture : seul { autoplay: true } active la lecture automatique", () => {
  assert.equal(parseHeroMobileSetting({ autoplay: true }).autoplay, true);
  for (const v of [null, undefined, {}, { autoplay: false }, { autoplay: "true" }, { autoplay: 1 }, [true], true, "x", 5, { enabled: true }]) {
    assert.equal(parseHeroMobileSetting(v).autoplay, false, JSON.stringify(v));
  }
});
t("valeur lisible = exactement ce que la base accepte", () => {
  assert.equal(isHeroMobileValueReadable({ autoplay: true }), true);
  assert.equal(isHeroMobileValueReadable({ autoplay: false }), true);
  for (const v of [null, {}, { autoplay: "true" }, { autoplay: 1 }, { autoplay: null }, { autoplay: true, mode: "x" }, [true], "x", 5]) {
    assert.equal(isHeroMobileValueReadable(v), false, JSON.stringify(v));
  }
});
t("valeur à enregistrer", () => {
  assert.deepEqual(buildHeroMobileValue(true), { autoplay: true });
  assert.deepEqual(buildHeroMobileValue(false), { autoplay: false });
  assert.deepEqual(buildHeroMobileValue("true"), { autoplay: false });
  assert.deepEqual(buildHeroMobileValue(undefined), { autoplay: false });
  assert.equal(isHeroMobileValueReadable(buildHeroMobileValue(true)), true);
});
t("comparaison et libellés", () => {
  assert.equal(sameHeroMobileSetting({ autoplay: true }, { autoplay: true }), true);
  assert.equal(sameHeroMobileSetting(null, { autoplay: false }), true);
  assert.equal(sameHeroMobileSetting(null, { autoplay: true }), false);
  assert.equal(heroMobileLabel(true), "Lecture automatique");
  assert.equal(heroMobileLabel(false), "Image fixe + ▶");
  assert.equal(describeHeroMobileSetting(null), "Image fixe + ▶");
  assert.equal(describeHeroMobileSetting({ autoplay: true }), "Lecture automatique");
});
t("saisie du nombre de visites", () => {
  assert.deepEqual(parseVisitsInput("100"), { ok: true, visits: 100 });
  assert.deepEqual(parseVisitsInput(" 1 "), { ok: true, visits: 1 });
  assert.deepEqual(parseVisitsInput("1000000"), { ok: true, visits: 1000000 });
  assert.deepEqual(parseVisitsInput(String(DEFAULT_VISITS)), { ok: true, visits: 100 });
  for (const v of ["", "  ", "0", "-3", "1,5", "1e3", "abc", "1000001", "12345678", null, undefined, {}]) {
    assert.equal(parseVisitsInput(v).ok, false, String(v));
  }
});
t("chemins Storage et image fixe", () => {
  assert.deepEqual(splitStoragePath("site/hero_video/123-a.mp4"), { dir: "site/hero_video", name: "123-a.mp4" });
  assert.equal(splitStoragePath("ring-bleu.png"), null);
  assert.equal(splitStoragePath("https://x.co/a/b.mp4"), null);
  assert.equal(heroPosterPath("site/hero_video/123-a.mp4"), "site/hero_video/poster_123-a.jpg");
  assert.equal(heroPosterPath("site/savoir_faire_photo/1-a.jpg"), null);
});
t("taille lue dans la liste Storage", () => {
  const items = [{ name: "123-a.mp4", metadata: { size: 3200000 } }, { name: "poster_123-a.jpg", metadata: { size: 120000 } }, { name: "x", metadata: null }];
  assert.equal(sizeFromStorageList(items, "123-a.mp4"), 3200000);
  assert.equal(sizeFromStorageList(items, "poster_123-a.jpg"), 120000);
  assert.equal(sizeFromStorageList(items, "x"), null);
  assert.equal(sizeFromStorageList(items, "absent"), null);
  assert.equal(sizeFromStorageList(null, "a"), null);
  assert.equal(sizeFromStorageList([{ name: "a", metadata: { size: 0 } }], "a"), null);
});
t("estimation : 3,2 Mo - 0,12 Mo = 3,08 Mo par visite", () => {
  const e = estimateHeroEgress({ videoBytes: 3200000, posterBytes: 120000, visits: 100 });
  assert.ok(Math.abs(e.perVisitMo - 3.08) < 1e-9);
  assert.ok(Math.abs(e.totalMo - 308) < 1e-6);
  assert.ok(Math.abs(e.percent - 6.16) < 1e-6);
  assert.equal(e.posterKnown, true);
  assert.equal(e.visits, 100);
});
t("estimation : cas limites sans NaN ni valeur négative", () => {
  assert.equal(estimateHeroEgress({ videoBytes: null, posterBytes: 1, visits: 10 }), null);
  assert.equal(estimateHeroEgress({ videoBytes: 0, posterBytes: 1, visits: 10 }), null);
  assert.equal(estimateHeroEgress({ videoBytes: "x", posterBytes: 1, visits: 10 }), null);
  assert.equal(estimateHeroEgress({ videoBytes: 1e6, posterBytes: 1, visits: null }), null);
  assert.equal(estimateHeroEgress({ videoBytes: 1e6, posterBytes: 1, visits: 1.5 }), null);
  assert.equal(estimateHeroEgress({ videoBytes: 1e6, posterBytes: 1, visits: -1 }), null);
  const noPoster = estimateHeroEgress({ videoBytes: 3200000, posterBytes: null, visits: 10 });
  assert.equal(noPoster.posterKnown, false);
  assert.ok(Math.abs(noPoster.totalMo - 32) < 1e-9);
  const heavyPoster = estimateHeroEgress({ videoBytes: 100000, posterBytes: 500000, visits: 10 });
  assert.equal(heavyPoster.perVisitMo, 0);
  assert.equal(heavyPoster.totalMo, 0);
  const zero = estimateHeroEgress({ videoBytes: 3200000, posterBytes: 120000, visits: 0 });
  assert.equal(zero.totalMo, 0);
});
t("formats", () => {
  assert.equal(formatMo(3.08), "3,08");
  assert.equal(formatMo(308), "308");
  assert.equal(formatMo(30.84), "30,8");
  assert.equal(formatMo(3080), "3\u00a0080");
  assert.equal(formatMo(0), "0,00");
  assert.equal(formatMo(NaN), "—");
  assert.equal(formatPercent(6.16), "6,2");
  assert.equal(formatPercent(0.04), "moins de 0,1");
  assert.equal(formatPercent(0), "0,0");
  assert.equal(formatPercent(Infinity), "—");
});
t("textes du bloc de chiffres", () => {
  const e = estimateHeroEgress({ videoBytes: 3200000, posterBytes: 120000, visits: 100 });
  const still = heroEgressSummary(false, e);
  assert.ok(still.headline.startsWith("Économie : jusqu'à 308 Mo"), still.headline);
  assert.ok(still.detail.includes("100 visites mobiles") && still.detail.includes("6,2 % du quota de 5 Go") && still.detail.includes("▶"), still.detail);
  const auto = heroEgressSummary(true, e);
  assert.ok(auto.headline.startsWith("Surcoût : environ 308 Mo"), auto.headline);
  assert.ok(heroEgressSummary(false, estimateHeroEgress({ videoBytes: 3200000, posterBytes: 120000, visits: 1 })).detail.includes("1 visite mobile "));
  assert.ok(heroEgressSummary(false, estimateHeroEgress({ videoBytes: 3200000, posterBytes: null, visits: 5 })).detail.includes("introuvable"));
  const none = heroEgressSummary(false, null);
  assert.equal(none.headline, "Calcul indisponible");
  assert.ok(!/NaN|undefined|Infinity/.test(JSON.stringify([still, auto, none])));
});
t("erreurs lisibles", () => {
  assert.match(heroMobileErrorMessage({ message: 'new row for relation "site_settings" violates check constraint "site_settings_hero_mobile_valid"' }), /règle de validation/);
  assert.match(heroMobileErrorMessage({ message: "new row violates row-level security policy" }), /droits d'administration/);
  assert.match(heroMobileErrorMessage({ message: "Failed to fetch" }), /Connexion impossible/);
  assert.match(heroMobileErrorMessage(null), /Échec de l'enregistrement/);
  assert.equal(isDuplicateKeyError({ code: "23505" }), true);
  assert.equal(isDuplicateKeyError({ message: "duplicate key value violates unique constraint" }), true);
  assert.equal(isDuplicateKeyError({ code: "42501" }), false);
  assert.equal(isDuplicateKeyError(null), false);
});
t("le réglage ne passe jamais outre un choix de la visiteuse (shouldAutoplayHero)", () => {
  const narrow = { width: 400 };
  assert.equal(shouldAutoplayHero({ ...narrow, mobileAutoplay: false }), false);
  assert.equal(shouldAutoplayHero({ ...narrow, mobileAutoplay: parseHeroMobileSetting({ autoplay: true }).autoplay }), true);
  assert.equal(shouldAutoplayHero({ ...narrow, mobileAutoplay: true, saveData: true }), false);
  assert.equal(shouldAutoplayHero({ ...narrow, mobileAutoplay: true, effectiveType: "2g" }), false);
  assert.equal(shouldAutoplayHero({ ...narrow, mobileAutoplay: true, effectiveType: "slow-2g" }), false);
  assert.equal(shouldAutoplayHero({ ...narrow, mobileAutoplay: true, reducedMotion: true }), false);
  assert.equal(shouldAutoplayHero({ width: 1280, mobileAutoplay: false }), true); // ordinateur : inchangé
});

console.log(passed + " test(s) réussi(s)" + (process.exitCode ? " — des échecs sont listés ci-dessus." : "."));
