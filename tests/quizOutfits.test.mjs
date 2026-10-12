// Tests des couleurs de vêtements (lib/quizOutfits.js). Lancement : node tests/quizOutfits.test.mjs
import assert from "node:assert/strict";
import { loadLib, makeRunner } from "./loadLib.mjs";

const O = await loadLib("quizOutfits.js");
const E = await loadLib("colorEngine.js");
const { test, finish } = makeRunner();
const HEX = /^#[0-9a-f]{6}$/i;

test("quatre saisons, huit couleurs chacune, noms et couleurs valides, noms uniques par saison", () => {
  assert.deepEqual(O.OUTFIT_SEASONS, E.SEASON_KEYS);
  for (const k of O.OUTFIT_SEASONS) {
    assert.equal(O.GARMENTS[k].length, 8, k);
    assert.equal(new Set(O.GARMENTS[k].map((g) => g[0])).size, 8, k);
    for (const [name, hex, tone] of O.GARMENTS[k]) {
      assert.ok(name && HEX.test(hex) && ["bright", "soft", "deep", "neutral"].includes(tone), JSON.stringify([k, name, hex, tone]));
    }
  }
});
test("chaque saison propose au moins une couleur de chaque ton utilisé par les occasions", () => {
  const tones = new Set(O.OCCASIONS.flatMap((o) => o.tags));
  for (const k of O.OUTFIT_SEASONS) for (const t of tones) assert.ok(O.GARMENTS[k].some((g) => g[2] === t), k + " / " + t);
});
test("six occasions, clés uniques, textes non vides, trois tons chacune", () => {
  assert.equal(O.OCCASIONS.length, 6);
  assert.deepEqual(O.OCCASIONS.map((o) => o.key), ["anniv", "diner", "soiree", "mariage", "pro", "weekend"]);
  for (const o of O.OCCASIONS) assert.ok(o.label && o.text.length > 30 && o.tags.length === 3, o.key);
});
test("outfitFor : trois couleurs distinctes pour chaque saison et chaque occasion, la première selon le premier ton", () => {
  for (const k of O.OUTFIT_SEASONS) for (const o of O.OCCASIONS) {
    const out = O.outfitFor(k, o);
    assert.equal(out.length, 3, k + "/" + o.key);
    assert.equal(new Set(out.map((g) => g[1])).size, 3, k + "/" + o.key);
    assert.equal(out[0][2], o.tags[0], k + "/" + o.key);
  }
});
test("outfitFor : exemple connu (Automne, anniversaire)", () => {
  assert.deepEqual(O.outfitFor("automne", O.OCCASIONS[0]).map((g) => g[0]), ["Terracotta", "Abricot", "Crème"]);
});
test("outfitFor : saison ou occasion inconnue ou absente -> liste vide, sans erreur ; la palette d'origine n'est pas modifiée", () => {
  for (const [s, o] of [["noel", O.OCCASIONS[0]], [undefined, O.OCCASIONS[0]], ["automne", undefined], ["automne", {}], ["automne", { tags: "x" }], [null, null]]) assert.deepEqual(O.outfitFor(s, o), []);
  const before = JSON.stringify(O.GARMENTS);
  O.outfitFor("hiver", O.OCCASIONS[1]);
  assert.equal(JSON.stringify(O.GARMENTS), before);
});
test("outfitFor : une occasion sans ton disponible prend la première couleur restante, sans doublon ni erreur", () => {
  const out = O.outfitFor("hiver", { tags: ["inconnu", "inconnu", "inconnu", "inconnu"] });
  assert.equal(out.length, 4);
  assert.equal(new Set(out.map((g) => g[1])).size, 4);
});
test("occasionByKey : trouve l'occasion, ou la première par défaut", () => {
  assert.equal(O.occasionByKey("pro").label, "Rendez-vous pro");
  assert.equal(O.occasionByKey("inconnue").key, "anniv");
  assert.equal(O.occasionByKey(undefined).key, "anniv");
});
test("flatteringGarment : une couleur valide pour chaque saison, null sinon", () => {
  for (const k of O.OUTFIT_SEASONS) assert.ok(HEX.test(O.flatteringGarment(k)), k);
  assert.equal(O.flatteringGarment("noel"), null);
});
test("couleurs « à éviter » : deux par saison, valides", () => {
  for (const k of O.OUTFIT_SEASONS) {
    assert.equal(O.AVOID[k].length, 2);
    for (const [name, hex] of O.AVOID[k]) assert.ok(name && HEX.test(hex));
  }
});
test("couleurs de secours des saisons : accroche et quatre couleurs", () => {
  for (const k of O.OUTFIT_SEASONS) {
    assert.ok(O.SEASON_DEFAULTS[k].tag.length > 5);
    assert.equal(O.SEASON_DEFAULTS[k].dots.length, 4);
    for (const d of O.SEASON_DEFAULTS[k].dots) assert.ok(HEX.test(d));
  }
});
test("le fichier ne contient aucune classe Tailwind (il n'est pas analysé par Tailwind)", async () => {
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("../lib/quizOutfits.js", import.meta.url), "utf8");
  assert.ok(!/className|\bbg-\[|\btext-\[|\bgrid-cols/.test(src));
});

await finish("quizOutfits");
