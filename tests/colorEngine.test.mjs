// Tests du moteur de colorimétrie (lib/colorEngine.js). Lancement : node tests/colorEngine.test.mjs
import assert from "node:assert/strict";
import { loadLib, makeRunner } from "./loadLib.mjs";

const E = await loadLib("colorEngine.js");
const { test, finish } = makeRunner();

const idx = (list, name) => {
  const i = list.findIndex((o) => o.name === name);
  assert.ok(i >= 0, "option inconnue : " + name);
  return i;
};
const P = (hair, eye, skin, metal) => ({ hair: idx(E.HAIR, hair), eye: idx(E.EYES, eye), skin: idx(E.SKIN, skin), metal });
const combos = [];
for (let h = 0; h < E.HAIR.length; h++) for (let e = 0; e < E.EYES.length; e++) for (let s = 0; s < E.SKIN.length; s++) combos.push({ hair: h, eye: e, skin: s });
const AXES = { printemps: [1, 1], ete: [-1, 1], automne: [1, -1], hiver: [-1, -1] };

// ---------------------------------------------------------------- couleurs
test("hexToRgb : formats valides, avec ou sans #, majuscules", () => {
  assert.deepEqual(E.hexToRgb("#ffffff"), [255, 255, 255]);
  assert.deepEqual(E.hexToRgb("1C1B20"), [28, 27, 32]);
  assert.deepEqual(E.hexToRgb(" #6b4130 "), [107, 65, 48]);
});
test("hexToRgb : refuse tout ce qui n'est pas une couleur à 6 chiffres", () => {
  for (const bad of ["#fff", "zzzzzz", "#12345G", "", null, undefined, 123456, "#1234567", "rgb(1,2,3)", {}, []]) assert.equal(E.hexToRgb(bad), null, String(bad));
});
test("clarté : noir proche de 0, blanc proche de 100", () => {
  assert.ok(E.lightness("#000000") < 0.01);
  assert.ok(Math.abs(E.lightness("#ffffff") - 100) < 0.05);
  assert.equal(E.lightness("pas une couleur"), null);
});
test("deltaE : nul pour deux couleurs identiques, symétrique, nul si une couleur est invalide", () => {
  assert.equal(E.deltaE("#6b4130", "#6b4130"), 0);
  assert.equal(E.deltaE("#6b4130", "#6fa4d6"), E.deltaE("#6fa4d6", "#6b4130"));
  assert.ok(Math.abs(E.deltaE("#000000", "#ffffff") - 100) < 0.1);
  assert.equal(E.deltaE("#6b4130", "zz"), null);
  assert.equal(E.deltaE(null, "#6b4130"), null);
});
test("mixHex : 0 % = a, 100 % = b, 50 % = milieu, valeurs hors limites bornées, couleur invalide sans erreur", () => {
  assert.equal(E.mixHex("#102030", "#ffffff", 0), "#102030");
  assert.equal(E.mixHex("#102030", "#ffffff", 100), "#ffffff");
  assert.equal(E.mixHex("#000000", "#ffffff", 50), "#808080");
  assert.equal(E.mixHex("#102030", "#000000", 16), "#0d1b28"); // 84 % de a : même résultat que color-mix(in srgb, a, #000 16%)
  assert.equal(E.mixHex("#102030", "#ffffff", -40), "#102030");
  assert.equal(E.mixHex("#102030", "#ffffff", 400), "#ffffff");
  assert.equal(E.mixHex("pas une couleur", "#ffffff", 50), "#000000");
  assert.equal(E.mixHex("#102030", "pas une couleur", 50), "#102030");
});

// ---------------------------------------------------------------- palette du mannequin
test("mannequinPalette : sans couleur ou avec des couleurs invalides, les couleurs neutres sont utilisées, sans erreur", () => {
  for (const input of [undefined, null, {}, { hair: "rouge", eye: 5, skin: null, garment: "#12" }, "x", 3]) {
    const p = E.mannequinPalette(input);
    for (const k of ["hair", "eye", "skin", "garment"]) assert.equal(p[k], E.MANNEQUIN_DEFAULTS[k], JSON.stringify(input) + " " + k);
  }
});
test("mannequinPalette : les couleurs valides sont reprises, les nuances dérivées sont calculées (ombre, sourcils, cils, joues, lèvres)", () => {
  const p = E.mannequinPalette({ hair: "#6a4a35", eye: "#8a5a2b", skin: "#b57a4a", garment: "#c8643b" });
  assert.deepEqual([p.hair, p.eye, p.skin, p.garment], ["#6a4a35", "#8a5a2b", "#b57a4a", "#c8643b"]);
  assert.equal(p.skinDark, "#98663e");
  assert.equal(p.brow, E.mixHex("#6a4a35", "#000000", 22));
  assert.equal(p.lash, E.mixHex("#6a4a35", "#000000", 55));
  assert.equal(p.blush, E.mixHex("#b57a4a", "#d9536a", 42));
  assert.equal(p.lip, E.mixHex("#b57a4a", "#b3445a", 58));
  for (const k of ["skinDark", "brow", "lash", "blush", "lip"]) assert.match(p[k], /^#[0-9a-f]{6}$/, k);
});
test("mannequinPalette : une couleur invalide ne change que sa propre couleur", () => {
  const p = E.mannequinPalette({ hair: "#112233", eye: "oups" });
  assert.equal(p.hair, "#112233");
  assert.equal(p.eye, E.MANNEQUIN_DEFAULTS.eye);
});
test("mannequinPalette : toutes les combinaisons de choix donnent une palette complète et valide", () => {
  for (const c of combos) {
    const p = E.mannequinPalette({ hair: E.HAIR[c.hair].hex, eye: E.EYES[c.eye].hex, skin: E.SKIN[c.skin].hex, garment: "#c8643b" });
    for (const v of Object.values(p)) assert.match(v, /^#[0-9a-f]{6}$/);
  }
});

// ---------------------------------------------------------------- classement
test("calibrage : les constantes correspondent aux choix proposés", () => {
  const c = E.calibrate();
  for (const k of ["temperature", "lum"]) {
    assert.ok(Math.abs(c[k].mean - E.CALIB[k].mean) < 1e-9 && Math.abs(c[k].sd - E.CALIB[k].sd) < 1e-9, k);
    assert.ok(c[k].sd > 0.1, "écart-type non nul : " + k);
  }
});
test("les choix proposés sont ceux de la maquette validée : 8 cheveux, 6 yeux, 8 peaux, couleurs valides et uniques", () => {
  assert.equal(E.HAIR.length, 8);
  assert.equal(E.EYES.length, 6);
  assert.equal(E.SKIN.length, 8);
  for (const list of [E.HAIR, E.EYES, E.SKIN]) {
    assert.equal(new Set(list.map((o) => o.name)).size, list.length);
    assert.equal(new Set(list.map((o) => o.hex)).size, list.length);
    for (const o of list) assert.ok(E.hexToRgb(o.hex) && Number.isFinite(o.warmth) && o.name);
  }
});
test("classify : renvoie null (sans lever d'erreur) pour un profil incomplet ou faux", () => {
  const bad = [undefined, null, {}, { hair: 0 }, { hair: 0, eye: 0 }, { hair: -1, eye: 0, skin: 0 }, { hair: 0, eye: 6, skin: 0 }, { hair: 0, eye: 0, skin: 8 }, { hair: 8, eye: 0, skin: 0 }, { hair: 1.5, eye: 0, skin: 0 }, { hair: "0", eye: 0, skin: 0 }, { hair: NaN, eye: 0, skin: 0 }, "texte", 42];
  for (const b of bad) assert.equal(E.classify(b), null, JSON.stringify(b));
});
test("classify : une réponse « métal » inattendue est traitée comme « je ne sais pas »", () => {
  const base = E.classify({ hair: 2, eye: 1, skin: 3 });
  for (const m of [undefined, null, 0, 2, -2, "or", "1", NaN, true, {}]) {
    const r = E.classify({ hair: 2, eye: 1, skin: 3, metal: m });
    assert.equal(r.primary, base.primary, String(m));
    assert.equal(r.axes.temperature, base.axes.temperature, String(m));
  }
});
test("classify : pur et déterministe (même résultat, profil non modifié)", () => {
  const p = { hair: 6, eye: 1, skin: 4, metal: 1 };
  const copy = JSON.stringify(p);
  const a = E.classify(p);
  const b = E.classify(p);
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(p), copy);
});
test("1152 combinaisons : saisons valides, distinctes, écart positif, frontière cohérente", () => {
  for (const c of combos) for (const m of [-1, 0, 1]) {
    const r = E.classify({ ...c, metal: m });
    assert.ok(E.SEASON_KEYS.includes(r.primary) && E.SEASON_KEYS.includes(r.secondary));
    assert.notEqual(r.primary, r.secondary);
    assert.ok(r.margin >= 0);
    assert.equal(r.borderline, r.margin < E.BORDERLINE_MARGIN);
    for (const k of E.SEASON_KEYS) assert.ok(r.scores[r.primary] >= r.scores[k]);
    assert.ok(Object.values(r.axes).every(Number.isFinite));
  }
});
test("la saison voisine ne diffère de la saison principale que par UN axe (jamais la saison opposée)", () => {
  for (const c of combos) for (const m of [-1, 0, 1]) {
    const r = E.classify({ ...c, metal: m });
    const diff = AXES[r.primary].filter((v, i) => v !== AXES[r.secondary][i]).length;
    assert.equal(diff, 1, JSON.stringify(c) + " " + r.primary + "/" + r.secondary);
  }
});
test("la saison retenue correspond aux signes de la température et de la valeur", () => {
  for (const c of combos) {
    const r = E.classify({ ...c, metal: 0 });
    if (Math.abs(r.axes.temperature) < 1e-6 || Math.abs(r.axes.value) < 1e-6) continue;
    assert.deepEqual(AXES[r.primary], [r.axes.temperature >= 0 ? 1 : -1, r.axes.value >= 0 ? 1 : -1]);
  }
});
test("répartition équilibrée : chaque saison entre 20 % et 30 % des 1152 combinaisons", () => {
  const n = { printemps: 0, ete: 0, automne: 0, hiver: 0 };
  let total = 0;
  for (const c of combos) for (const m of [-1, 0, 1]) { n[E.classify({ ...c, metal: m }).primary]++; total++; }
  for (const k of E.SEASON_KEYS) assert.ok(n[k] / total >= 0.2 && n[k] / total <= 0.3, k + " : " + ((100 * n[k]) / total).toFixed(1) + " %");
});
test("« or ou argent » nuance sans décider : entre 15 % et 25 % des profils changent de saison", () => {
  let changed = 0;
  for (const c of combos) { if (E.classify({ ...c, metal: 1 }).primary !== E.classify({ ...c, metal: -1 }).primary) changed++; }
  const share = changed / combos.length;
  assert.ok(share >= 0.15 && share <= 0.25, (100 * share).toFixed(1) + " %");
});
test("« or » ne rend jamais plus froid ; « argent » ne rend jamais plus chaud ; la valeur ne bouge pas", () => {
  for (const c of combos) {
    const z = E.classify({ ...c, metal: 0 }), o = E.classify({ ...c, metal: 1 }), g = E.classify({ ...c, metal: -1 });
    assert.ok(o.axes.temperature > z.axes.temperature && z.axes.temperature > g.axes.temperature);
    assert.equal(o.axes.value, z.axes.value);
    assert.equal(g.axes.value, z.axes.value);
  }
});
test("« or » ne fait jamais passer d'une saison chaude à une saison froide, ni l'inverse pour « argent »", () => {
  const warm = (k) => k === "printemps" || k === "automne";
  for (const c of combos) {
    const z = E.classify({ ...c, metal: 0 }).primary;
    if (warm(z)) assert.ok(warm(E.classify({ ...c, metal: 1 }).primary));
    else assert.ok(!warm(E.classify({ ...c, metal: -1 }).primary));
  }
});
test("cas de référence : portraits classiques", () => {
  const cases = [
    [P("Blond cendré", "Bleu", "Porcelaine", 0), "ete"], [P("Gris argenté", "Bleu", "Porcelaine", 0), "ete"],
    [P("Noir", "Marron foncé", "Porcelaine", 0), "hiver"], [P("Noir", "Marron foncé", "Brun rosé", 0), "hiver"],
    [P("Brun foncé", "Marron foncé", "Beige doré", 0), "automne"], [P("Brun foncé", "Noisette", "Caramel", 0), "automne"],
    [P("Blond doré", "Ambre", "Hâlé doré", 0), "printemps"], [P("Blond doré", "Bleu", "Beige clair", 0), "printemps"],
  ];
  for (const [p, want] of cases) assert.equal(E.classify(p).primary, want, JSON.stringify(p));
});
test("cas signalé (roux cuivré, noisette, hâlé doré) : Automne, à la frontière avec le Printemps", () => {
  const r = E.classify(P("Roux cuivré", "Noisette", "Hâlé doré", 0));
  assert.equal(r.primary, "automne");
  assert.equal(r.secondary, "printemps");
  assert.equal(r.borderline, true);
});
test("la réponse « métal » peut trancher un cas limite, dans le bon sens", () => {
  const p = { hair: idx(E.HAIR, "Roux cuivré"), eye: idx(E.EYES, "Vert"), skin: idx(E.SKIN, "Porcelaine") };
  assert.equal(E.classify({ ...p, metal: 1 }).primary, "printemps");
  assert.notEqual(E.classify({ ...p, metal: -1 }).primary, "printemps");
});
test("poids personnalisés : température seule, ou valeur seule, changent bien le résultat", () => {
  const p = P("Blond cendré", "Bleu", "Porcelaine", 0);
  assert.equal(E.classify(p, { weights: { temperature: 1, value: 0 } }).axes.temperature, E.classify(p).axes.temperature);
  assert.ok(E.classify(p, { weights: { temperature: 0, value: 1 } }).scores.ete > 0);
});

// ---------------------------------------------------------------- textes de la révélation
test("traitLabels : trois mots par saison, premier en majuscule ; vide pour une saison inconnue", () => {
  assert.deepEqual(E.traitLabels("automne"), ["Chaud", "Profond", "Doux"]);
  assert.deepEqual(E.traitLabels("hiver"), ["Froid", "Profond", "Net"]);
  assert.deepEqual(E.traitLabels("noel"), []);
});
test("borderlineNote : phrase seulement à la frontière, avec les noms de l'onglet Familles", () => {
  const r = E.classify(P("Roux cuivré", "Noisette", "Hâlé doré", 0));
  assert.equal(E.borderlineNote(r), "Votre coloris est à la frontière entre Automne et Printemps : les bagues Printemps peuvent aussi vous flatter.");
  assert.match(E.borderlineNote(r, { automne: "Automne chaud" }), /entre Automne chaud et Printemps/);
  assert.equal(E.borderlineNote(E.classify(P("Noir", "Marron foncé", "Porcelaine", 0))), "");
  assert.equal(E.borderlineNote(null), "");
});
test("metalRemark : saisons chaudes (prolonge la chaleur) et saisons froides (c'est la pierre qui fait l'accord)", () => {
  for (const k of ["printemps", "automne"]) assert.match(E.metalRemark(k), /prolonge la chaleur/);
  for (const k of ["ete", "hiver"]) assert.match(E.metalRemark(k), /pierre qui fait l'accord/);
});

// ---------------------------------------------------------------- explications : toujours une phrase
const COL = (slug, name, price, seasonKey, dominantColors, neighbourKey) => ({ slug, name, price, seasonKey, dominantColors, neighbourKey });
const SHOP = [
  COL("citron", "Citron", 79, "printemps", [{ name: "Jaune citron", hex: "#e9dc4a" }]),
  COL("verte", "Verte", 89, "printemps", [{ name: "Vert vif", hex: "#5bb36a" }]),
  COL("rose-bonbon", "Rose Bonbon", 85, "printemps", [{ name: "Rose vif", hex: "#e86fa6" }]),
  COL("bleue", "Bleue", 85, "ete", [{ name: "Bleu pur", hex: "#7db3ea" }]),
  COL("bleu-de-mer", "Bleu de Mer", 89, "ete", [{ name: "Bleu océan", hex: "#5aa9d6" }]),
  COL("rose", "Rose", 89, "ete", [{ name: "Rose tendre", hex: "#e7a1b6" }]),
  COL("chocolat", "Chocolat", 79, "automne", [{ name: "Chocolat", hex: "#6b4130" }, { name: "Brun doré", hex: "#a0764f" }, { name: "Crème", hex: "#f3e6cf" }]),
  COL("bleu-saphir", "Bleu Saphir", 99, "hiver", [{ name: "Bleu saphir", hex: "#27479b" }]),
  COL("bleu-violette", "Bleu Violette", 95, "hiver", [{ name: "Bleu violet", hex: "#6d63c9" }]),
  COL("violette", "Violette", 95, "hiver", [{ name: "Violet profond", hex: "#8a4fc0" }]),
];
const NAMES = { printemps: "Printemps", ete: "Été", automne: "Automne", hiver: "Hiver" };

test("echoSentence : couleur proche des cheveux, des yeux, et formulation « Sa teinte … »", () => {
  const choc = SHOP.find((c) => c.slug === "chocolat");
  assert.equal(E.echoSentence(P("Châtain", "Vert", "Beige clair"), choc), "Sa teinte chocolat rappelle vos cheveux.");
  assert.equal(E.echoSentence(P("Blond doré", "Noisette", "Beige clair"), choc), "Sa teinte brun doré fait écho à vos yeux noisette.");
  assert.equal(E.echoSentence(P("Noir", "Bleu", "Porcelaine"), SHOP.find((c) => c.slug === "bleu-de-mer")), "Sa teinte bleu océan fait écho à vos yeux bleus.");
});
test("echoSentence : aucune phrase STRICTE quand la couleur est éloignée, ou quand les données sont absentes ou fausses", () => {
  assert.equal(E.echoSentence(P("Noir", "Bleu", "Porcelaine"), SHOP.find((c) => c.slug === "violette")), null);
  for (const dc of [[], undefined, [{ name: "Chocolat", hex: "pas une couleur" }], [{ name: "   ", hex: "#6b4130" }], [null, 3, "x"]]) {
    assert.equal(E.echoSentence(P("Châtain", "Vert", "Beige clair"), COL("x", "X", 10, "ete", dc)), null);
  }
  assert.equal(E.echoSentence(null, SHOP[0]), null);
  assert.equal(E.echoSentence(P("Châtain", "Vert", "Beige clair"), null), null);
});
test("echoSentence : le nom saisi est repris tel quel (texte brut), première lettre en minuscule", () => {
  const s = E.echoSentence(P("Châtain", "Vert", "Beige clair"), COL("x", "X", 10, "automne", [{ name: "<b>Chocolat</b> Ambré", hex: "#6b4130" }]));
  assert.equal(s, "Sa teinte <b>Chocolat</b> Ambré rappelle vos cheveux.");
});
test("whyText : trois niveaux (écho, rapprochement, palette), jamais de phrase vide", () => {
  const choc = SHOP.find((c) => c.slug === "chocolat");
  const echo = E.whyText(P("Châtain", "Vert", "Beige clair"), { collection: choc, kind: "best" }, { primary: "automne", names: NAMES });
  assert.equal(echo.level, "echo");
  assert.match(echo.text, /^Sa teinte chocolat rappelle vos cheveux\. Elle épouse la chaleur/);
  // Chocolat (#6b4130) est à ΔE 19,6 des yeux noisette : assez proche pour « se rapproche », pas pour « fait écho »
  const near = E.whyText(P("Blond doré", "Noisette", "Beige clair"), { collection: COL("x", "X", 1, "automne", [{ name: "Chocolat", hex: "#6b4130" }]), kind: "season" }, { primary: "automne", names: NAMES });
  assert.equal(near.level, "near");
  assert.equal(near.text, "Sa teinte chocolat se rapproche de vos yeux noisette. Elle épouse la chaleur et la profondeur de votre coloris.");
  const pal = E.whyText(P("Noir", "Bleu", "Porcelaine"), { collection: SHOP.find((c) => c.slug === "violette"), kind: "season" }, { primary: "hiver", names: NAMES });
  assert.equal(pal.level, "palette");
  assert.equal(pal.text, "Sa teinte violet profond fait partie de votre palette, Hiver. Elle répond à la netteté et au contraste de votre coloris.");
});
test("whyText : sans couleur dominante -> « Cette bague … » ; saison voisine ; collection pensée aussi pour la saison", () => {
  const none = E.whyText(P("Noir", "Bleu", "Porcelaine"), { collection: COL("x", "X", 1, "hiver", []), kind: "season" }, { primary: "hiver", names: NAMES });
  assert.match(none.text, /^Cette bague fait partie de votre palette, Hiver\./);
  const nb = E.whyText(P("Noir", "Bleu", "Porcelaine"), { collection: COL("x", "X", 1, "ete", []), kind: "neighbour" }, { primary: "hiver", names: NAMES });
  assert.equal(nb.text, "Cette bague fait partie de la palette Été, voisine de votre saison principale : elle peut aussi vous flatter.");
  const also = E.whyText(P("Noir", "Bleu", "Porcelaine"), { collection: COL("x", "X", 1, "ete", [{ name: "Fuchsia", hex: "#ff1493" }]), kind: "best", origin: "also" }, { primary: "hiver", names: NAMES });
  assert.equal(also.text, "Sa teinte fuchsia est de la palette Été, mais elle est aussi pensée pour la vôtre, Hiver.");
});
test("whyText : n'échoue jamais sur des données incomplètes, et ne contient jamais « undefined », « null » ou « NaN »", () => {
  const profile = P("Châtain", "Vert", "Beige clair");
  for (const pick of [undefined, null, {}, { collection: null }, { collection: {} }, { collection: { dominantColors: "x" } }, { collection: { seasonKey: "noel", dominantColors: [null] }, kind: "neighbour" }]) {
    for (const ctx of [undefined, null, {}, { primary: "noel" }, { primary: "automne", names: null }]) {
      const w = E.whyText(profile, pick, ctx);
      assert.ok(w.text.length > 20 && !/undefined|null|NaN/.test(w.text), JSON.stringify([pick, ctx]) + " -> " + w.text);
    }
  }
});
test("whyText : les noms de saisons de l'onglet Familles sont utilisés", () => {
  const w = E.whyText(P("Noir", "Bleu", "Porcelaine"), { collection: COL("x", "X", 1, "hiver", []), kind: "season" }, { primary: "hiver", names: { hiver: "Hiver glacé" } });
  assert.match(w.text, /palette, Hiver glacé\./);
});
test("recommend : CHAQUE bague proposée a une phrase « Pourquoi elle vous va » (1152 profils × boutique complète)", () => {
  let count = 0;
  for (const c of combos) for (const m of [-1, 0, 1]) {
    const r = E.recommend({ ...c, metal: m }, SHOP, { seasonNames: NAMES });
    for (const p of r.picks) {
      assert.ok(typeof p.why === "string" && p.why.length > 30 && p.why.endsWith("."), JSON.stringify([c, p.collection.slug, p.why]));
      assert.ok(!/undefined|null|NaN/.test(p.why));
      assert.ok(["echo", "near", "palette"].includes(p.level));
      if (p.level === "echo") assert.ok(p.echo);
      count++;
    }
  }
  assert.ok(count > 3000, "nombre de bagues vérifiées : " + count);
});
test("recommend : les trois niveaux d'explication existent bien dans la boutique d'exemple", () => {
  const levels = new Set();
  for (const c of combos) for (const p of E.recommend({ ...c, metal: 0 }, SHOP).picks) levels.add(p.level);
  assert.deepEqual([...levels].sort(), ["echo", "near", "palette"]);
});
test("recommend : renvoie null pour un profil incomplet, sans lever d'erreur", () => {
  assert.equal(E.recommend(null, SHOP), null);
  assert.equal(E.recommend({ hair: 0 }, SHOP), null);
});
test("recommend : liste vide ou absente -> aucune bague, saison peu fournie, pas d'erreur", () => {
  for (const list of [[], undefined, null, "x", [null, 3, {}]]) {
    const r = E.recommend(P("Blond doré", "Bleu", "Beige clair", 0), list);
    assert.deepEqual(r.picks, []);
    assert.equal(r.thin, true);
    assert.equal(r.primaryCount, 0);
  }
});
test("recommend : 3 bagues au plus, sans doublon, la meilleure en tête, aucune saison opposée", () => {
  for (const c of combos) for (const m of [-1, 0, 1]) {
    const r = E.recommend({ ...c, metal: m }, SHOP);
    assert.ok(r.picks.length <= 3);
    assert.equal(new Set(r.picks.map((p) => p.collection.slug)).size, r.picks.length);
    for (const p of r.picks) {
      const opposite = AXES[p.collection.seasonKey].filter((v, i) => v !== AXES[r.result.primary][i]).length === 2;
      assert.ok(!opposite, p.collection.slug + " est de la saison opposée à " + r.result.primary);
    }
    if (r.picks.length && r.picks[0].collection.seasonKey === r.result.primary) assert.equal(r.picks[0].kind, "best");
    assert.ok(r.picks.filter((p) => p.kind === "best").length <= 1);
  }
});
test("recommend : saison Automne = une seule collection (Chocolat) -> en tête, saison signalée peu fournie, complétée par la saison voisine", () => {
  const r = E.recommend(P("Brun foncé", "Noisette", "Caramel", 0), SHOP);
  assert.equal(r.result.primary, "automne");
  assert.equal(r.picks[0].collection.slug, "chocolat");
  assert.equal(r.picks[0].kind, "best");
  assert.equal(r.thin, true);
  assert.equal(r.primaryCount, 1);
  assert.ok(r.picks.length >= 2 && r.picks.slice(1).every((p) => p.kind === "neighbour"));
});
test("recommend : une saison bien fournie n'est pas signalée peu fournie", () => {
  const r = E.recommend(P("Blond doré", "Ambre", "Hâlé doré", 0), SHOP);
  assert.equal(r.result.primary, "printemps");
  assert.equal(r.thin, false);
  assert.equal(r.primaryCount, 3);
  assert.deepEqual(r.picks.map((p) => p.collection.seasonKey), ["printemps", "printemps", "printemps"]);
});
test("recommend : la « saison voisine » choisie dans l'administration fait remonter une collection d'une autre saison", () => {
  const shop = SHOP.concat([COL("terre", "Terre d'ombre", 90, "ete", [{ name: "Terre d'ombre", hex: "#7a5a43" }], "automne")]);
  const r = E.recommend(P("Brun foncé", "Noisette", "Caramel", 0), shop);
  const slugs = r.picks.map((p) => p.collection.slug);
  assert.equal(slugs[0], "chocolat");
  assert.equal(slugs[1], "terre");
  assert.equal(r.picks[1].kind, "also");
  assert.match(r.picks[1].why, /aussi pensée pour la palette Automne|aussi pensée pour la vôtre, Automne/);
});
test("recommend : une collection pensée aussi pour la saison, promue « meilleure », garde son explication d'origine", () => {
  const shop = [COL("terre", "Terre d'ombre", 90, "ete", [{ name: "Gris", hex: "#999999" }], "automne")];
  const r = E.recommend(P("Brun foncé", "Noisette", "Caramel", 0), shop);
  assert.equal(r.picks[0].kind, "best");
  assert.equal(r.picks[0].origin, "also");
  assert.match(r.picks[0].why, /est de la palette Été, mais elle est aussi pensée pour la vôtre, Automne\./);
});
test("recommend : à saison égale, la collection avec un écho de couleur passe devant, puis le prix le plus bas", () => {
  const shop = [COL("a", "A", 50, "automne", [{ name: "Violet", hex: "#8a4fc0" }]), COL("b", "B", 90, "automne", [{ name: "Chocolat", hex: "#6b4130" }]), COL("c", "C", 40, "automne", [{ name: "Violet", hex: "#8a4fc0" }])];
  const r = E.recommend(P("Châtain", "Noisette", "Caramel", 0), shop);
  assert.deepEqual(r.picks.map((p) => p.collection.slug), ["b", "c", "a"]);
  assert.ok(r.picks[0].echo);
});
test("recommend : collections incomplètes ou à saison inconnue ignorées ; prix absent en dernier", () => {
  const shop = [COL("ok", "Ok", 80, "automne", []), { slug: "sans-saison", name: "X" }, COL("bizarre", "B", 10, "noel", []), null, COL("sans-prix", "SP", undefined, "automne", [])];
  const r = E.recommend(P("Brun foncé", "Noisette", "Caramel", 0), shop);
  assert.deepEqual(r.picks.map((p) => p.collection.slug), ["ok", "sans-prix"]);
  assert.equal(r.primaryCount, 2);
});
test("recommend : l'option max est respectée ; une valeur fausse revient à 3 ; la liste reçue n'est jamais modifiée", () => {
  const p = P("Blond doré", "Ambre", "Hâlé doré", 0);
  assert.equal(E.recommend(p, SHOP, { max: 1 }).picks.length, 1);
  assert.equal(E.recommend(p, SHOP, { max: 0 }).picks.length, 3);
  assert.equal(E.recommend(p, SHOP, { max: "2" }).picks.length, 3);
  const copy = JSON.stringify(SHOP);
  E.recommend(P("Brun foncé", "Noisette", "Caramel", 1), SHOP);
  assert.equal(JSON.stringify(SHOP), copy);
});
test("phrases : chaque saison a ses textes", () => {
  for (const k of E.SEASON_KEYS) assert.ok(E.SEASON_LINE[k].length > 20 && E.SEASON_WHY[k].length > 20 && E.SEASON_NAMES[k] && E.SEASON_TRAITS[k]);
});

await finish("colorEngine");
