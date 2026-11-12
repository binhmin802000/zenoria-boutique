// Tests de lib/transferDueFormat.js (date et heure de l'echeance du virement).
// Lancer : node tests/transferDueFormat.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { formatDueDateTime } from "../lib/transferDueFormat.js";

test("echeance a 23h59 heure de Paris, en novembre (UTC+1)", () => {
  // 13/11/2026 23:59 Europe/Paris = 22:59 UTC
  assert.equal(formatDueDateTime("2026-11-13T22:59:00.000Z"), "13/11/2026 à 23 h 59");
});

test("echeance a 23h59 heure de Paris, en ete (UTC+2)", () => {
  // 13/07/2026 23:59 Europe/Paris = 21:59 UTC
  assert.equal(formatDueDateTime("2026-07-13T21:59:00.000Z"), "13/07/2026 à 23 h 59");
});

test("une heure a un seul chiffre est affichee sur deux (08 h 05)", () => {
  // 05/01/2026 08:05 Europe/Paris = 07:05 UTC
  assert.equal(formatDueDateTime("2026-01-05T07:05:00.000Z"), "05/01/2026 à 08 h 05");
});

test("valeur absente ou invalide", () => {
  assert.equal(formatDueDateTime(null), "—");
  assert.equal(formatDueDateTime(undefined), "—");
  assert.equal(formatDueDateTime(""), "—");
  assert.equal(formatDueDateTime("pas une date"), "—");
});

test("accepte un objet Date en plus d'une chaine ISO", () => {
  const d = new Date("2026-11-13T22:59:00.000Z");
  assert.equal(formatDueDateTime(d), "13/11/2026 à 23 h 59");
});
