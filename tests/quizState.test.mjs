// Tests de l'état du quiz, du panier et du catalogue (lib/quizState.js). Lancement : node tests/quizState.test.mjs
import assert from "node:assert/strict";
import { loadLib, makeRunner } from "./loadLib.mjs";

const S = await loadLib("quizState.js");
const E = await loadLib("colorEngine.js");
const { test, finish } = makeRunner();

class FakeStorage {
  constructor(initial) { this.map = new Map(Object.entries(initial || {})); this.fail = false; }
  getItem(k) { if (this.fail) throw new Error("accès refusé"); return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { if (this.fail) throw new Error("quota dépassé"); this.map.set(k, String(v)); }
}

// ---------------------------------------------------------------- adresse du résultat
test("encodeResultHash / parseResultHash : aller-retour exact sur toutes les combinaisons", () => {
  let n = 0;
  for (let h = 0; h < E.HAIR.length; h++) for (let e = 0; e < E.EYES.length; e++) for (let s = 0; s < E.SKIN.length; s++) for (const m of [-1, 0, 1]) {
    const p = { hair: h, eye: e, skin: s, metal: m };
    const hash = S.encodeResultHash(p);
    assert.match(hash, /^#r=\d\.\d\.\d\.-?[01]$/);
    assert.deepEqual(S.parseResultHash(hash), p);
    n++;
  }
  assert.equal(n, 1152);
});
test("encodeResultHash : « métal » absent ou faux devient 0 ; profil incomplet -> chaîne vide", () => {
  assert.equal(S.encodeResultHash({ hair: 6, eye: 1, skin: 4 }), "#r=6.1.4.0");
  assert.equal(S.encodeResultHash({ hair: 6, eye: 1, skin: 4, metal: 5 }), "#r=6.1.4.0");
  assert.equal(S.encodeResultHash({ hair: 6, eye: 1, skin: null, metal: 1 }), "");
  assert.equal(S.encodeResultHash(null), "");
});
test("parseResultHash : refuse tout ce qui n'est pas un résultat valide (jamais d'erreur)", () => {
  const bad = ["", "#", "#r=", "#r=1.2.3", "#r=1.2.3.4.5", "#r=a.b.c.d", "#r=8.0.0.0", "#r=0.6.0.0", "#r=0.0.8.0", "#r=-1.0.0.0", "#r=1.2.3.", "r=1.2.3.0", "#R=1.2.3.0", "#r=1.2.3.0;", "#r=1,2,3,0", "#access_token=abc&type=signup", "#r=999.1.1.0", "#r=1.2.3.0 ", null, undefined, 5, {}];
  for (const b of bad) assert.equal(S.parseResultHash(b), null, JSON.stringify(b));
});
test("parseResultHash : un « métal » inattendu (mais numérique) devient 0", () => {
  assert.equal(S.parseResultHash("#r=1.2.3.7").metal, 0);
  assert.equal(S.parseResultHash("#r=1.2.3.-1").metal, -1);
});
test("l'adresse ne contient que des indices (aucun texte, aucune donnée personnelle)", () => {
  assert.ok(S.encodeResultHash({ hair: 7, eye: 5, skin: 7, metal: -1 }).length <= 12);
});

// ---------------------------------------------------------------- panier
const key = S.CART_STORAGE_KEY;
test("la clé et la limite du panier sont celles de la boutique", () => {
  assert.equal(S.CART_STORAGE_KEY, "zenoria_cart_v2");
  assert.equal(S.MAX_QTY_PER_PRODUCT, 10);
});
test("addToStoredCart : panier vide -> 1 bague ; deuxième ajout -> quantité 2, même forme que la boutique", () => {
  const st = new FakeStorage();
  assert.deepEqual(S.addToStoredCart(st, 7), { ok: true, qty: 1 });
  assert.deepEqual(JSON.parse(st.getItem(key)), { items: [{ id: 7, qty: 1 }], promo: "" });
  assert.deepEqual(S.addToStoredCart(st, 7), { ok: true, qty: 2 });
  assert.deepEqual(JSON.parse(st.getItem(key)).items, [{ id: 7, qty: 2 }]);
  assert.equal(S.cartCount(st), 2);
});
test("addToStoredCart : conserve les autres bagues et le code promo déjà enregistrés", () => {
  const st = new FakeStorage({ [key]: JSON.stringify({ items: [{ id: 3, qty: 2 }, { id: 9, qty: 1 }], promo: "BIENVENUE10" }) });
  S.addToStoredCart(st, 9);
  S.addToStoredCart(st, 12);
  assert.deepEqual(JSON.parse(st.getItem(key)), { items: [{ id: 3, qty: 2 }, { id: 9, qty: 2 }, { id: 12, qty: 1 }], promo: "BIENVENUE10" });
});
test("addToStoredCart : limite de 10 par bague, refus clair au-delà, panier inchangé", () => {
  const st = new FakeStorage({ [key]: JSON.stringify({ items: [{ id: 5, qty: 10 }], promo: "" }) });
  assert.deepEqual(S.addToStoredCart(st, 5), { ok: false, reason: "max" });
  assert.equal(S.cartCount(st), 10);
  const st2 = new FakeStorage({ [key]: JSON.stringify({ items: [{ id: 5, qty: 9 }], promo: "" }) });
  assert.deepEqual(S.addToStoredCart(st2, 5), { ok: true, qty: 10 });
});
test("addToStoredCart : identifiant numérique ou texte reconnu comme la même bague", () => {
  const st = new FakeStorage({ [key]: JSON.stringify({ items: [{ id: "4", qty: 1 }], promo: "" }) });
  assert.deepEqual(S.addToStoredCart(st, 4), { ok: true, qty: 2 });
  assert.equal(JSON.parse(st.getItem(key)).items.length, 1);
});
test("panier illisible, absent ou abîmé : repart d'un panier vide sans erreur (comme la boutique)", () => {
  for (const raw of ["pas du json", "null", "42", '"x"', "{}", '{"items":"x"}', '{"items":[null,{"id":null}]}']) {
    const st = new FakeStorage({ [key]: raw });
    assert.equal(S.cartCount(st), 0, raw);
    assert.deepEqual(S.addToStoredCart(st, 1), { ok: true, qty: 1 }, raw);
  }
  assert.equal(S.cartCount(null), 0);
  assert.equal(S.cartCount(undefined), 0);
});
test("quantités enregistrées hors limites ramenées entre 1 et 10", () => {
  const st = new FakeStorage({ [key]: JSON.stringify({ items: [{ id: 1, qty: 99 }, { id: 2, qty: 0 }, { id: 3, qty: -4 }, { id: 4, qty: "x" }], promo: "" }) });
  assert.deepEqual(S.readStoredCart(st).items.map((i) => i.qty), [10, 1, 1, 1]);
});
test("stockage indisponible (navigation privée, quota) : refus propre, jamais d'exception", () => {
  const st = new FakeStorage();
  st.fail = true;
  assert.deepEqual(S.addToStoredCart(st, 1), { ok: false, reason: "storage" });
  assert.equal(S.cartCount(st), 0);
  assert.deepEqual(S.addToStoredCart(null, 1), { ok: false, reason: "storage" });
});
test("addToStoredCart : identifiant absent -> refus sans écrire", () => {
  const st = new FakeStorage();
  for (const id of [undefined, null, ""]) assert.deepEqual(S.addToStoredCart(st, id), { ok: false, reason: "invalid" });
  assert.equal(st.map.size, 0);
});

// ---------------------------------------------------------------- catalogue
const FAMS = [
  { id: 1, key: "printemps", name: "Printemps", is_season: true },
  { id: 2, key: "ete", name: "Été", is_season: true },
  { id: 3, key: "automne", name: "Automne chaud", is_season: true },
  { id: 4, key: "hiver", name: "Hiver", is_season: true },
  { id: 5, key: "limited", name: "Édition limitée", is_season: false },
];
const ROW = (o) => ({ id: 1, slug: "a", name: "A", collection: "Intention", energy: "e", price: "89.00", promo_price: null, photos: ["a.jpg"], color: "from-cyan-200 via-sky-100 to-blue-300", stone: "🌊", active: true, family_id: 3, neighbour_family_id: null, dominant_colors: [], ...o });
test("mapCatalog : saison, voisine, prix, photos et couleurs dominantes", () => {
  const { products, collections } = S.mapCatalog([ROW({ id: 10, slug: "chocolat", name: "Chocolat", price: "79.00", neighbour_family_id: 1, dominant_colors: [{ name: " Brun doré ", hex: "#a0764f" }] })], FAMS);
  assert.equal(products.length, 1);
  assert.deepEqual(collections[0], { slug: "chocolat", name: "Chocolat", price: 79, seasonKey: "automne", neighbourKey: "printemps", dominantColors: [{ name: "Brun doré", hex: "#a0764f" }] });
  assert.deepEqual(products[0].photos, ["a.jpg"]);
});
test("mapCatalog : une bague sans famille, ou d'une famille hors quiz, reste affichable mais sans saison (pas recommandée)", () => {
  const { products, collections } = S.mapCatalog([ROW({ id: 1, family_id: null }), ROW({ id: 2, slug: "b", family_id: 5 }), ROW({ id: 3, slug: "c", family_id: 99 }), ROW({ id: 4, slug: "d", family_id: 2, neighbour_family_id: 5 })], FAMS);
  assert.equal(products.length, 4);
  assert.deepEqual(products.map((p) => p.seasonKey), [null, null, null, "ete"]);
  assert.equal(products[3].neighbourKey, null);
  assert.deepEqual(collections.map((c) => c.slug), ["d"]);
});
test("mapCatalog : lignes inutilisables ignorées (inactives, sans identifiant ni adresse), jamais d'erreur", () => {
  const rows = [ROW({ active: false }), ROW({ id: null }), ROW({ id: undefined }), ROW({ slug: "" }), ROW({ slug: "   " }), null, undefined, 3, "x", ROW({ id: 8, slug: "ok" })];
  assert.deepEqual(S.mapCatalog(rows, FAMS).products.map((p) => p.slug), ["ok"]);
  for (const bad of [null, undefined, "x", 5, {}]) {
    assert.deepEqual(S.mapCatalog(bad, FAMS), { products: [], collections: [] });
    assert.equal(S.mapCatalog([ROW({})], bad).collections.length, 0);
  }
});
test("mapCatalog : prix absent ou faux -> null ; prix promotionnel utilisé seulement s'il est inférieur", () => {
  const { products, collections } = S.mapCatalog([ROW({ id: 1, price: "abc" }), ROW({ id: 2, slug: "b", price: "100", promo_price: "80" }), ROW({ id: 3, slug: "c", price: "100", promo_price: "120" }), ROW({ id: 4, slug: "d", price: "100", promo_price: "oups" })], FAMS);
  assert.deepEqual(products.map((p) => [p.price, p.promoPrice]), [[null, null], [100, 80], [100, null], [100, null]]);
  assert.deepEqual(collections.map((c) => c.price), [null, 80, 100, 100]);
});
test("mapCatalog : photos filtrées, visuel de secours par défaut", () => {
  const p = S.mapCatalog([ROW({ photos: ["a.jpg", 3, null, "", "b/c.jpg"], color: "", stone: null })], FAMS).products[0];
  assert.deepEqual(p.photos, ["a.jpg", "b/c.jpg"]);
  assert.equal(p.color, "from-rose-300 via-pink-100 to-white");
  assert.equal(p.stone, "💎");
  assert.deepEqual(S.mapCatalog([ROW({ photos: "x" })], FAMS).products[0].photos, []);
});
test("cleanDominantColors : 3 au plus, nom et couleur valides, nom limité à 40 caractères, jamais d'erreur", () => {
  const long = "x".repeat(60);
  const out = S.cleanDominantColors([{ name: "A", hex: "#112233" }, { name: "", hex: "#112233" }, { name: "B", hex: "rouge" }, { name: long, hex: "#445566" }, null, 5, { name: "C", hex: "#778899" }, { name: "D", hex: "#aabbcc" }]);
  assert.deepEqual(out.map((c) => c.name.length), [1, 40, 1]);
  assert.equal(out.length, 3);
  for (const v of [null, undefined, "x", 5, {}]) assert.deepEqual(S.cleanDominantColors(v), []);
});
test("seasonNamesFrom : noms de l'onglet Familles, secours conservés, noms vides ignorés", () => {
  const fallback = { printemps: "Printemps", ete: "Été", automne: "Automne", hiver: "Hiver" };
  assert.equal(S.seasonNamesFrom(FAMS, fallback).automne, "Automne chaud");
  assert.equal(S.seasonNamesFrom([{ key: "ete", name: "  ", is_season: true }], fallback).ete, "Été");
  assert.equal(S.seasonNamesFrom([{ key: "limited", name: "X", is_season: false }], fallback).limited, undefined);
  assert.deepEqual(S.seasonNamesFrom(null, fallback), fallback);
});
test("le catalogue converti s'utilise directement avec le moteur de recommandation", () => {
  const { collections } = S.mapCatalog([ROW({ id: 10, slug: "chocolat", name: "Chocolat", price: "79", dominant_colors: [{ name: "Chocolat", hex: "#6b4130" }] })], FAMS);
  const r = E.recommend({ hair: 1, eye: 1, skin: 5, metal: 0 }, collections, { seasonNames: S.seasonNamesFrom(FAMS) });
  assert.equal(r.result.primary, "automne");
  assert.equal(r.picks[0].collection.slug, "chocolat");
  assert.match(r.picks[0].why, /Automne chaud|chocolat/);
});
test("QUIZ_STEPS : trois questions dans l'ordre, avec leurs listes de teintes", () => {
  assert.deepEqual(S.QUIZ_STEPS.map((x) => x.key), ["hair", "eye", "skin"]);
  assert.deepEqual(S.QUIZ_STEPS.map((x) => x.list.length), [8, 6, 8]);
  for (const x of S.QUIZ_STEPS) assert.ok(x.title && x.help.length > 20);
});
test("le fichier ne contient aucune classe Tailwind (il n'est pas analysé par Tailwind)", async () => {
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("../lib/quizState.js", import.meta.url), "utf8");
  assert.ok(!/className|\bbg-\[|\btext-\[|\bgrid-cols/.test(src));
});

await finish("quizState");
