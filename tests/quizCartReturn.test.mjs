// Tests du retour du panier vers le quiz, des champs de la fiche bague et des outils de la boutique.
// Lancement : node tests/quizCartReturn.test.mjs
import assert from "node:assert/strict";
import { loadLib, makeRunner } from "./loadLib.mjs";

const S = await loadLib("quizState.js");
const U = await loadLib("shopUtils.js");
const { test, finish } = makeRunner();

// ---------------------------------------------------------------- adresse « #panier-quiz=… »
test("encodeCartReturnHash : même codage que le résultat, préfixe « #panier-quiz= »", () => {
  assert.equal(S.CART_RETURN_PREFIX, "#panier-quiz=");
  assert.equal(S.encodeCartReturnHash({ hair: 1, eye: 1, skin: 5, metal: 0 }), "#panier-quiz=1.1.5.0");
  assert.equal(S.encodeCartReturnHash({ hair: 6, eye: 1, skin: 4, metal: 1 }), "#panier-quiz=6.1.4.1");
  assert.equal(S.encodeCartReturnHash({ hair: 6, eye: 1, skin: 4, metal: -1 }), "#panier-quiz=6.1.4.-1");
});
test("encodeCartReturnHash : « métal » absent ou faux devient 0 ; profil incomplet ou faux -> chaîne vide", () => {
  assert.equal(S.encodeCartReturnHash({ hair: 6, eye: 1, skin: 4 }), "#panier-quiz=6.1.4.0");
  assert.equal(S.encodeCartReturnHash({ hair: 6, eye: 1, skin: 4, metal: null }), "#panier-quiz=6.1.4.0");
  assert.equal(S.encodeCartReturnHash({ hair: 6, eye: 1, skin: 4, metal: 5 }), "#panier-quiz=6.1.4.0");
  for (const bad of [null, undefined, {}, { hair: 0 }, { hair: 8, eye: 0, skin: 0 }, { hair: -1, eye: 0, skin: 0 }, "x", 3]) assert.equal(S.encodeCartReturnHash(bad), "", JSON.stringify(bad));
});
test("aller-retour exact sur les 1152 profils : encode puis parse redonne le même profil", () => {
  let n = 0;
  for (let h = 0; h < 8; h++) for (let e = 0; e < 6; e++) for (let s = 0; s < 8; s++) for (const m of [-1, 0, 1]) {
    const p = { hair: h, eye: e, skin: s, metal: m };
    assert.deepEqual(S.parseCartReturnHash(S.encodeCartReturnHash(p)), p);
    n++;
  }
  assert.equal(n, 1152);
});
test("l'adresse de retour reconstruit le même « /quiz#r=… » que le résultat affiché", () => {
  const p = { hair: 3, eye: 2, skin: 6, metal: -1 };
  assert.equal("/quiz" + S.encodeResultHash(S.parseCartReturnHash(S.encodeCartReturnHash(p))), "/quiz#r=3.2.6.-1");
});
test("parseCartReturnHash : refuse tout ce qui n'est pas un retour valide, sans erreur (le panier s'ouvre alors normalement)", () => {
  const bad = ["", "#", "#panier", "#panier-quiz", "#panier-quiz=", "#panier-quiz=1.2.3", "#panier-quiz=1.2.3.0.5", "#panier-quiz=zz", "#panier-quiz=a.b.c.d", "#panier-quiz=9.9.9.0", "#panier-quiz=8.0.0.0", "#panier-quiz=0.6.0.0", "#panier-quiz=0.0.8.0", "#panier-quiz=-1.0.0.0",
    "#panier-quiz=1.2.3.0;", "#panier-quiz= 1.2.3.0", "#panier-quizz=1.1.5.0", "#PANIER-QUIZ=1.1.5.0", "#r=1.1.5.0", "panier-quiz=1.1.5.0", "#panier-quiz=1,1,5,0", "#panier-quiz=999.1.1.0", null, undefined, 5, {}, []];
  for (const b of bad) assert.equal(S.parseCartReturnHash(b), null, JSON.stringify(b));
});
test("parseCartReturnHash : un « métal » numérique inattendu devient 0", () => {
  assert.equal(S.parseCartReturnHash("#panier-quiz=1.2.3.7").metal, 0);
  assert.equal(S.parseCartReturnHash("#panier-quiz=1.2.3.-1").metal, -1);
});
test("l'adresse de retour ne contient que des indices (aucun texte, aucune donnée personnelle)", () => {
  assert.ok(S.encodeCartReturnHash({ hair: 7, eye: 5, skin: 7, metal: -1 }).length <= 22);
  assert.match(S.encodeCartReturnHash({ hair: 7, eye: 5, skin: 7, metal: -1 }), /^#panier-quiz=[\d.\-]+$/);
});

// ---------------------------------------------------------------- champs de la fiche bague dans le catalogue du quiz
const FAMS = [{ id: 1, key: "printemps", name: "Printemps", is_season: true }, { id: 3, key: "automne", name: "Automne", is_season: true }];
const ROW = (o) => ({ id: 7, slug: "chocolat", name: "Chocolat", family_id: 3, collection: "Intention", energy: "e", price: "79", photos: ["a.jpg"], active: true, ...o });
test("mapCatalog : vidéo, stock et texte de vente sont repris pour la fiche", () => {
  const p = S.mapCatalog([ROW({ video: "chocolat/clip.mp4", stock: 4, pitch: "  Un brun chaleureux.  " })], FAMS).products[0];
  assert.equal(p.video, "chocolat/clip.mp4");
  assert.equal(p.stock, 4);
  assert.equal(p.pitch, "Un brun chaleureux.");
});
test("mapCatalog : sans vidéo -> null ; stock absent ou faux -> 0 ; texte absent -> chaîne vide", () => {
  for (const [v, st, pi] of [[undefined, undefined, undefined], [null, null, null], ["", "5", 3], ["   ", NaN, {}]]) {
    const p = S.mapCatalog([ROW({ video: v, stock: st, pitch: pi })], FAMS).products[0];
    assert.equal(p.video, null);
    assert.equal(p.stock, 0);
    assert.equal(p.pitch, "");
  }
  assert.equal(S.mapCatalog([ROW({ stock: "5" })], FAMS).products[0].stock, 0);
  assert.equal(S.mapCatalog([ROW({ stock: NaN })], FAMS).products[0].stock, 0);
  assert.equal(S.mapCatalog([ROW({ stock: 0 })], FAMS).products[0].stock, 0);
});
test("mapCatalog : ces champs ne changent pas la liste envoyée au moteur de couleurs", () => {
  const c = S.mapCatalog([ROW({ video: "v.mp4", stock: 9, pitch: "x", dominant_colors: [{ name: "Chocolat", hex: "#6b4130" }] })], FAMS).collections[0];
  assert.deepEqual(Object.keys(c).sort(), ["dominantColors", "name", "neighbourKey", "price", "seasonKey", "slug"]);
});

// ---------------------------------------------------------------- outils de la boutique déplacés dans lib/shopUtils.js
test("formatPrice : euros, virgule, espace insécable", () => {
  assert.equal(U.formatPrice(79).replace(/\u202f|\u00a0/g, " "), "79,00 €");
  assert.equal(U.formatPrice(1234.5).replace(/\u202f|\u00a0/g, " "), "1 234,50 €");
});
test("getAvailability : en stock, stock partiel, rupture (mêmes textes que dans le panier)", () => {
  assert.equal(U.BACKORDER_LEAD_TIME, "5 jours");
  assert.deepEqual(U.getAvailability({ stock: 5 }), { state: "in-stock", stock: 5, label: "5 disponibles", detail: "" });
  assert.deepEqual(U.getAvailability({ stock: 1 }), { state: "in-stock", stock: 1, label: "1 disponible", detail: "" });
  const partial = U.getAvailability({ stock: 3 }, 5);
  assert.equal(partial.state, "partial-backorder");
  assert.equal(partial.label, "3 disponibles");
  assert.equal(partial.detail, "2 exemplaires fabriqués sur commande · délai 5 jours");
  assert.equal(U.getAvailability({ stock: 3 }, 4).detail, "1 exemplaire fabriqué sur commande · délai 5 jours");
  const out = U.getAvailability({ stock: 0 });
  assert.deepEqual([out.state, out.label, out.detail], ["backorder", "Rupture de stock", "Fabriquée sur commande · délai 5 jours"]);
});
test("getAvailability : stock absent ou faux -> rupture, sans erreur", () => {
  for (const p of [{}, { stock: null }, { stock: "5" }, { stock: -2 }]) assert.equal(U.getAvailability(p).state, "backorder", JSON.stringify(p));
});
test("les fichiers de lib/ ne contiennent aucune classe Tailwind", async () => {
  const fs = await import("node:fs");
  for (const f of ["quizState.js", "shopUtils.js", "useModalFocus.js"]) {
    const src = fs.readFileSync(new URL("../lib/" + f, import.meta.url), "utf8");
    assert.ok(!/className|\bbg-\[|\btext-\[|\bgrid-cols/.test(src), f);
  }
});

await finish("quizCartReturn");
