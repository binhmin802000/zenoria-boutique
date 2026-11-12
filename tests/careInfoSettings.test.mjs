// Tests de la logique pure du reglage « Entretien du bijou » (lib/careInfoSettings.js).
// Lancer : node tests/careInfoSettings.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {
  CARE_INFO_MAX_LENGTH,
  DEFAULT_CARE_INFO,
  DEFAULT_CARE_INFO_CONTENT,
  parseCareInfoSetting,
  validateCareInfoContent,
  buildCareInfoValue,
  sameCareInfoSetting,
  parseCareInfoInline,
  parseCareInfoContent,
  careInfoExcerpt,
} from "../lib/careInfoSettings.js";

test("reglage absent ou illisible : valeurs par defaut (actif, contenu par defaut)", () => {
  assert.deepEqual(parseCareInfoSetting(null), DEFAULT_CARE_INFO);
  assert.deepEqual(parseCareInfoSetting(undefined), DEFAULT_CARE_INFO);
  assert.deepEqual(parseCareInfoSetting({}), DEFAULT_CARE_INFO);
  assert.deepEqual(parseCareInfoSetting([1, 2]), DEFAULT_CARE_INFO);
  assert.deepEqual(parseCareInfoSetting({ enabled: "oui", content: 123 }), DEFAULT_CARE_INFO);
});

test("reglage enregistre : valeurs reelles respectees", () => {
  const v = parseCareInfoSetting({ enabled: false, content: "Texte personnalisé." });
  assert.equal(v.enabled, false);
  assert.equal(v.content, "Texte personnalisé.");
});

test("contenu vide (espaces) retombe sur le contenu par defaut", () => {
  assert.equal(parseCareInfoSetting({ enabled: true, content: "   " }).content, DEFAULT_CARE_INFO_CONTENT);
});

test("validation : texte vide refuse", () => {
  const r = validateCareInfoContent("");
  assert.equal(r.ok, false);
  assert.match(r.error, /vide/);
  assert.equal(validateCareInfoContent("   ").ok, false);
});

test("validation : texte trop long refuse, avec la longueur dans le message", () => {
  const long = "a".repeat(CARE_INFO_MAX_LENGTH + 1);
  const r = validateCareInfoContent(long);
  assert.equal(r.ok, false);
  assert.match(r.error, new RegExp(String(CARE_INFO_MAX_LENGTH)));
});

test("validation : a la limite exacte, accepte", () => {
  assert.equal(validateCareInfoContent("a".repeat(CARE_INFO_MAX_LENGTH)).ok, true);
});

test("validation : texte normal accepte", () => {
  assert.equal(validateCareInfoContent("Un texte simple.").ok, true);
});

test("construction de la valeur a enregistrer", () => {
  assert.deepEqual(buildCareInfoValue(true, "abc"), { enabled: true, content: "abc" });
  assert.deepEqual(buildCareInfoValue(0, null), { enabled: false, content: "" });
});

test("comparaison de reglages (detecte une modification)", () => {
  assert.equal(sameCareInfoSetting({ enabled: true, content: "x" }, { enabled: true, content: "x" }), true);
  assert.equal(sameCareInfoSetting({ enabled: true, content: "x" }, { enabled: false, content: "x" }), false);
  assert.equal(sameCareInfoSetting({ enabled: true, content: "x" }, { enabled: true, content: "y" }), false);
  assert.equal(sameCareInfoSetting(null, DEFAULT_CARE_INFO), true); // absent == valeurs par defaut
});

// ---------- Balisage **gras** / __souligne__ ----------

test("balisage : texte simple, sans marqueur", () => {
  assert.deepEqual(parseCareInfoInline("Un texte simple."), [{ text: "Un texte simple.", bold: false, underline: false }]);
});

test("balisage : un mot en gras au milieu de la phrase", () => {
  const out = parseCareInfoInline("Ceci est **important** pour vous.");
  assert.deepEqual(out, [
    { text: "Ceci est ", bold: false, underline: false },
    { text: "important", bold: true, underline: false },
    { text: " pour vous.", bold: false, underline: false },
  ]);
});

test("balisage : un mot souligne", () => {
  const out = parseCareInfoInline("Évitez __l'eau courante__ absolument.");
  assert.deepEqual(out, [
    { text: "Évitez ", bold: false, underline: false },
    { text: "l'eau courante", bold: false, underline: true },
    { text: " absolument.", bold: false, underline: false },
  ]);
});

test("balisage : plusieurs passages dans la meme ligne", () => {
  const out = parseCareInfoInline("**Avant.** Un mot __souligne__ et un autre **gras**.");
  assert.deepEqual(out, [
    { text: "Avant.", bold: true, underline: false },
    { text: " Un mot ", bold: false, underline: false },
    { text: "souligne", bold: false, underline: true },
    { text: " et un autre ", bold: false, underline: false },
    { text: "gras", bold: true, underline: false },
    { text: ".", bold: false, underline: false },
  ]);
});

test("balisage : marqueur non ferme reste tel quel (pas de plantage, pas de gras errone)", () => {
  const out = parseCareInfoInline("Un **mot mal ferme");
  assert.deepEqual(out, [{ text: "Un **mot mal ferme", bold: false, underline: false }]);
});

test("balisage : ligne vide", () => {
  assert.deepEqual(parseCareInfoInline(""), [{ text: "", bold: false, underline: false }]);
  assert.deepEqual(parseCareInfoInline(null), [{ text: "", bold: false, underline: false }]);
});

test("balisage : ** vide (sans mot a l'interieur) n'est pas interprete comme du gras", () => {
  const out = parseCareInfoInline("Deux etoiles **** cote a cote.");
  assert.ok(!out.some((s) => s.bold));
});

// ---------- Paragraphes ----------

test("paragraphes : separes par une ligne vide, lignes simples vers segments", () => {
  const content = "Premier paragraphe.\n\n**Deuxieme** paragraphe\nsur deux lignes.";
  const paras = parseCareInfoContent(content);
  assert.equal(paras.length, 2);
  assert.equal(paras[0].length, 1); // 1 ligne
  assert.equal(paras[1].length, 2); // 2 lignes
  assert.deepEqual(paras[1][0], [{ text: "Deuxieme", bold: true, underline: false }, { text: " paragraphe", bold: false, underline: false }]);
});

test("paragraphes : lignes vides superflues ignorees, CRLF tolere", () => {
  const content = "A.\r\n\r\n\r\nB.\r\n\r\n";
  const paras = parseCareInfoContent(content);
  assert.equal(paras.length, 2);
});

test("paragraphes : texte vide -> aucun paragraphe", () => {
  assert.deepEqual(parseCareInfoContent(""), []);
  assert.deepEqual(parseCareInfoContent("   \n\n  "), []);
  assert.deepEqual(parseCareInfoContent(null), []);
});

test("contenu par defaut : se decoupe en 5 paragraphes sans erreur", () => {
  const paras = parseCareInfoContent(DEFAULT_CARE_INFO_CONTENT);
  assert.equal(paras.length, 5);
  assert.ok(paras[1][0].some((s) => s.bold && s.text === "Avant de la porter."));
});

// ---------- Resume pour l'encart ----------

test("resume : texte court renvoye tel quel, sans balisage", () => {
  const r = careInfoExcerpt("**Attention** à __l'humidité__.", 170);
  assert.equal(r, "Attention à l'humidité.");
});

test("resume : ne prend que le premier paragraphe", () => {
  const r = careInfoExcerpt("Premier paragraphe court.\n\nDeuxieme paragraphe qui ne doit pas apparaitre.", 170);
  assert.equal(r, "Premier paragraphe court.");
});

test("resume : texte long coupe proprement sur un mot entier, avec points de suspension", () => {
  const long = "Les cristaux Swarovski sont en verre, donc durs, mais le revetement qui leur donne leurs couleurs et leur effet nacre est fragile vraiment tres fragile et delicat.";
  const r = careInfoExcerpt(long, 80);
  assert.ok(r.length <= 82);
  assert.ok(r.endsWith("…"));
  assert.ok(!r.slice(0, -1).endsWith(" "));
});

test("resume : contenu par defaut produit un texte non vide et plausible", () => {
  const r = careInfoExcerpt(DEFAULT_CARE_INFO_CONTENT);
  assert.ok(r.length > 0 && r.length <= 172);
  assert.ok(!r.includes("**") && !r.includes("__"));
});
