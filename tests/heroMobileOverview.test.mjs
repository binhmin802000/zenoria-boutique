// ZENORIA_HERO_MOBILE_V2 : tests de lib/heroMobileOverview.js — lancer avec : node tests/heroMobileOverview.test.mjs
import assert from "node:assert/strict";
import { heroMobileOverviewItems, formatHeroMobileLogValue } from "../lib/heroMobileOverview.js";

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

t("ligne absente : image fixe + ▶ (par défaut), jamais « Non défini »", () => {
  for (const row of [null, undefined]) {
    const items = heroMobileOverviewItems(row);
    assert.equal(items.length, 1);
    assert.equal(items[0].id, "hero_mobile_state");
    assert.equal(items[0].text, "Image fixe + ▶ (par défaut)");
    assert.equal(items[0].missing, false);
    assert.equal(items[0].tone, undefined);
    assert.ok(items[0].sub.includes("par défaut"));
  }
});
t("image fixe enregistrée : pas de « (par défaut) »", () => {
  const [it] = heroMobileOverviewItems({ value: { autoplay: false }, updated_at: "x" });
  assert.equal(it.text, "Image fixe + ▶");
  assert.equal(it.tone, undefined);
  assert.ok(it.sub.includes("▶"));
});
t("lecture automatique enregistrée : alerte (coût d'egress)", () => {
  const [it] = heroMobileOverviewItems({ value: { autoplay: true } });
  assert.equal(it.text, "Lecture automatique");
  assert.equal(it.tone, "warn");
  assert.ok(it.sub.includes("cached egress"));
});
t("valeur illisible : alerte et ce que le site applique", () => {
  for (const [value, applied] of [[{}, "Image fixe + ▶"], [{ autoplay: "true" }, "Image fixe + ▶"], [null, "Image fixe + ▶"], [[true], "Image fixe + ▶"], [{ autoplay: true, mode: "x" }, "Lecture automatique"]]) {
    const [it] = heroMobileOverviewItems({ value });
    assert.equal(it.text, "Valeur illisible", JSON.stringify(value));
    assert.equal(it.tone, "warn");
    assert.equal(it.sub, "Le site applique : " + applied + ".", JSON.stringify(value));
  }
});
t("aucune valeur parasite dans les textes", () => {
  const all = [null, { value: { autoplay: true } }, { value: { autoplay: false } }, { value: 5 }].flatMap((r) => heroMobileOverviewItems(r));
  assert.ok(!/NaN|undefined|null|Infinity/.test(JSON.stringify(all)));
});
t("journal : valeurs du champ autoplay", () => {
  assert.equal(formatHeroMobileLogValue("autoplay", true), "Lecture automatique");
  assert.equal(formatHeroMobileLogValue("autoplay", false), "Image fixe + ▶");
  assert.equal(formatHeroMobileLogValue("autoplay", "true"), null);
  assert.equal(formatHeroMobileLogValue("autoplay", 1), null);
});
t("journal : les autres champs ne sont jamais touchés", () => {
  for (const f of ["enabled", "mode", "days", "everyDays", "shuffledAt", "minutes", "stripe_enabled", "email", undefined]) {
    assert.equal(formatHeroMobileLogValue(f, true), null, String(f));
    assert.equal(formatHeroMobileLogValue(f, "x"), null, String(f));
  }
});

console.log(passed + " test(s) réussi(s)" + (process.exitCode ? " — des échecs sont listés ci-dessus." : "."));
