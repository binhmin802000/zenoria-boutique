// Tests de lib/careInfoOverview.js (ligne « Entretien du bijou » de Accueil › Configuration).
// Lancer : node tests/careInfoOverview.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { careInfoOverviewItems } from "../lib/careInfoOverview.js";

test("reglage absent : actif par defaut, mention '(par defaut)'", () => {
  const items = careInfoOverviewItems(null);
  assert.equal(items.length, 1);
  assert.equal(items[0].flag, true);
  assert.match(items[0].sub, /par défaut/);
});

test("reglage enregistre (desactive) : etat reel, sans mention 'par defaut'", () => {
  const items = careInfoOverviewItems({ value: { enabled: false, content: "x" } });
  assert.equal(items[0].flag, false);
  assert.doesNotMatch(items[0].sub, /par défaut/);
});

test("reglage illisible : retombe sur les valeurs par defaut sans planter", () => {
  const items = careInfoOverviewItems({ value: { enabled: "oui" } });
  assert.equal(items[0].flag, true);
});
