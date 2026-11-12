// Tests de la logique pure de la pastille partagee (lib/accountNewsBadge.js).
// Lancer : node tests/accountNewsBadge.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {
  badgeCacheKey,
  ordersFromNewsRows,
  parseBadgeFetchCache,
  isBadgeFetchFresh,
  countBadgeTotal,
} from "../lib/accountNewsBadge.js";
import { emptyStore, fillBaseline } from "../lib/accountNews.js";

const T = (s) => "2026-11-" + s + "T10:00:00+00:00";
const row = (order_id, status, day, extra = {}) => ({ order_id, status, changed_at: T(day), note: null, visible: true, par_moi: false, payment_method: null, cancelled_by: null, ...extra });
const storeAt = (orders, seen = {}, reviews = {}) => ({ v: 1, orders: Date.parse(T(orders)), seen, reviews });

test("cle de cache : par compte", () => {
  assert.equal(badgeCacheKey("abc"), "zenoria_account_news_fetch_v1:abc");
  assert.notEqual(badgeCacheKey("a"), badgeCacheKey("b"));
});

test("reconstruction des commandes a partir des lignes (payment_method, cancelled_by)", () => {
  const rows = [
    row(1, "shipped", "05", { payment_method: "card" }),
    row(1, "delivered", "06", { payment_method: "card" }),
    row(2, "paid", "05", { payment_method: "transfer", cancelled_by: null }),
    row(3, "cancelled", "05", { payment_method: "transfer", cancelled_by: "system" }),
  ];
  const orders = ordersFromNewsRows(rows);
  assert.deepEqual(orders, [
    { id: 1, payment_method: "card", cancelled_by: null },
    { id: 2, payment_method: "transfer", cancelled_by: null },
    { id: 3, payment_method: "transfer", cancelled_by: "system" },
  ]);
});

test("reconstruction : lignes invalides ignorees, aucun doublon", () => {
  assert.deepEqual(ordersFromNewsRows(null), []);
  assert.deepEqual(ordersFromNewsRows([null, undefined, { status: "shipped" }]), []);
  const rows = [row(1, "shipped", "05"), row(1, "delivered", "06")];
  assert.equal(ordersFromNewsRows(rows).length, 1);
});

test("cache : contenu invalide ignore", () => {
  assert.equal(parseBadgeFetchCache(null), null);
  assert.equal(parseBadgeFetchCache(""), null);
  assert.equal(parseBadgeFetchCache("pas du json"), null);
  assert.equal(parseBadgeFetchCache(JSON.stringify({ rows: [], reviews: [] })), null); // at manquant
  assert.equal(parseBadgeFetchCache(JSON.stringify({ at: 1, rows: {}, reviews: [] })), null); // rows pas un tableau
  assert.deepEqual(parseBadgeFetchCache(JSON.stringify({ at: 123, rows: [1], reviews: [2] })), { rows: [1], reviews: [2], at: 123 });
});

test("fraicheur du cache : bornes et duree reglee", () => {
  assert.equal(isBadgeFetchFresh(null, 15, 1000), false);
  const entry = { rows: [], reviews: [], at: 1_000_000 };
  assert.equal(isBadgeFetchFresh(entry, 15, 1_000_000), true); // age 0
  assert.equal(isBadgeFetchFresh(entry, 15, 1_000_000 + 15 * 60000 - 1), true); // juste avant la limite
  assert.equal(isBadgeFetchFresh(entry, 15, 1_000_000 + 15 * 60000), false); // a la limite : expire
  assert.equal(isBadgeFetchFresh(entry, 60, 1_000_000 + 59 * 60000), true);
  assert.equal(isBadgeFetchFresh(entry, 5, 1_000_000 + 5 * 60000 + 1), false);
  assert.equal(isBadgeFetchFresh(entry, 15, 999_999), false); // horloge revenue en arriere : prudence, pas frais
  assert.equal(isBadgeFetchFresh(entry, 0, 1_000_000), true); // duree <= 0 traitee comme 1 minute minimum
});

test("total : sans memoire (store null), toujours 0", () => {
  const rows = [row(1, "shipped", "05")];
  assert.equal(countBadgeTotal(rows, [], null), 0);
  assert.equal(countBadgeTotal(null, null, null), 0);
});

test("total : identique a la logique de Mon compte (commandes + avis)", () => {
  const store = storeAt("04");
  const rows = [
    row(1, "shipped", "05", { payment_method: "card" }),
    row(1, "delivered", "06", { payment_method: "card" }),
    row(2, "paid", "07", { payment_method: "transfer" }), // virement confirme : compte
    row(3, "paid", "07", { payment_method: "card" }), // paiement carte, commande differente : exclu
  ];
  // Baseline des avis deja posee a vide (compte jamais ouvert Mon compte avant un premier avis) :
  // un avis publie, non encore dans cette liste vide, est donc une nouveaute.
  const storeNoReviewBaseline = { ...store, reviews: null };
  const storeWithEmptyReviewBaseline = fillBaseline(storeNoReviewBaseline, [], []);
  const reviews = [{ id: "r1", status: "published", reply: null }, { id: "r2", status: "pending", reply: null }];
  assert.equal(countBadgeTotal(rows, reviews, storeWithEmptyReviewBaseline), 4); // 2 (commande 1) + 1 (commande 2, virement) + 1 (avis r1 publie)
});

test("total : exclut paiement carte, annulation non automatique, action de la cliente", () => {
  const store = storeAt("01");
  const rows = [
    row(5, "paid", "02", { payment_method: "card" }),
    row(6, "cancelled", "02", { payment_method: "transfer", cancelled_by: "customer" }),
    row(7, "delivered", "02", { payment_method: "card", par_moi: true }),
  ];
  assert.equal(countBadgeTotal(rows, [], store), 0);
});

test("total : coherent avec orderNewsByOrder (meme resultat qu'un calcul manuel)", () => {
  const store = storeAt("04", { 9: Date.parse(T("06")) }); // commande 9 deja vue jusqu'au 06
  const rows = [
    row(9, "shipped", "05", { payment_method: "card" }),
    row(9, "delivered", "06", { payment_method: "card" }),
    row(9, "delivered", "09", { payment_method: "card" }), // evenement posterieur a la vue -> compte
    row(10, "shipped", "05", { payment_method: "card" }),
  ];
  // Attendu : commande 9 -> 1 (seul l'evenement du 09 est posterieur a seen=06), commande 10 -> 1
  assert.equal(countBadgeTotal(rows, [], store), 2);
});

test("total : avis deja vus (memes signatures) ne comptent pas", () => {
  const reviews = [{ id: 1, status: "published", reply: null }];
  const store = fillBaseline(emptyStore(), [], reviews); // baseline = etat courant, donc deja vu
  assert.equal(countBadgeTotal([], reviews, store), 0);
  const updated = [{ id: 1, status: "published", reply: "Merci", reply_at: "2026-11-12T08:00:00Z" }];
  assert.equal(countBadgeTotal([], updated, store), 1); // la reponse est nouvelle
});

test("total : reviews et rows non tableaux traites comme vides, sans planter", () => {
  const store = storeAt("01");
  assert.equal(countBadgeTotal("oups", undefined, store), 0);
});
