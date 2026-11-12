// Tests de lib/accountNewsCacheOverview.js (ligne « Pastille de nouveautés » de Accueil › Configuration).
// Lancer : node tests/accountNewsCacheOverview.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { accountNewsCacheOverviewItems } from "../lib/accountNewsCacheOverview.js";

test("reglage absent : valeurs par defaut, mention '(par defaut)', jamais 'Non defini'", () => {
  const items = accountNewsCacheOverviewItems(null);
  assert.equal(items.length, 2);
  const enabled = items.find((i) => i.id === "account_news_cache_enabled");
  const minutes = items.find((i) => i.id === "account_news_cache_minutes");
  assert.equal(enabled.flag, true);
  assert.match(enabled.sub, /par défaut/);
  assert.equal(minutes.text, "15 min (par défaut)");
  assert.equal(minutes.missing, false);
  assert.ok(!items.some((i) => i.text === "Non défini"));
});

test("reglage enregistre : valeurs reelles, sans mention 'par defaut'", () => {
  const row = { value: { enabled: false, minutes: 30 } };
  const items = accountNewsCacheOverviewItems(row);
  const enabled = items.find((i) => i.id === "account_news_cache_enabled");
  const minutes = items.find((i) => i.id === "account_news_cache_minutes");
  assert.equal(enabled.flag, false);
  assert.doesNotMatch(enabled.sub, /par défaut/);
  assert.equal(minutes.text, "30 min");
});

test("reglage illisible (valeur invalide) : retombe sur les valeurs par defaut sans planter", () => {
  const items = accountNewsCacheOverviewItems({ value: { enabled: "oui", minutes: "beaucoup" } });
  const enabled = items.find((i) => i.id === "account_news_cache_enabled");
  const minutes = items.find((i) => i.id === "account_news_cache_minutes");
  assert.equal(enabled.flag, true);
  assert.equal(minutes.text, "15 min");
});

test("bornes de duree respectees (valeur hors bornes ramenee aux limites)", () => {
  assert.equal(accountNewsCacheOverviewItems({ value: { enabled: true, minutes: 1 } }).find((i) => i.id === "account_news_cache_minutes").text, "5 min");
  assert.equal(accountNewsCacheOverviewItems({ value: { enabled: true, minutes: 999 } }).find((i) => i.id === "account_news_cache_minutes").text, "60 min");
});
