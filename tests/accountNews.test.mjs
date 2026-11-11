// Tests de la logique pure des nouveautes de « Mon compte » (lib/accountNews.js).
// Lancer : node tests/accountNews.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {
  storageKey,
  emptyStore,
  parseStore,
  maxChangedAt,
  isOrderNewsEvent,
  countOrderNews,
  reviewSignature,
  countReviewNews,
  fillBaseline,
  markOrdersSeen,
  markReviewsSeen,
  formatBadge,
} from "../lib/accountNews.js";

const T = (s) => "2026-11-" + s + "T10:00:00+00:00";
const row = (order_id, status, day, extra = {}) => ({ order_id, status, changed_at: T(day), note: null, visible: true, par_moi: false, ...extra });
const transfer = (id, extra = {}) => ({ id, payment_method: "transfer", status: "pending_transfer", cancelled_by: null, ...extra });
const card = (id, extra = {}) => ({ id, payment_method: "card", status: "paid", cancelled_by: null, ...extra });
const storeAt = (orders, reviews = {}) => ({ v: 1, orders: Date.parse(T(orders)), reviews });

test("evenements comptes : expediee, livree, virement confirme, annulation automatique", () => {
  assert.equal(isOrderNewsEvent(row(1, "shipped", "10"), card(1)), true);
  assert.equal(isOrderNewsEvent(row(1, "delivered", "10"), card(1)), true);
  assert.equal(isOrderNewsEvent(row(1, "paid", "10"), transfer(1)), true);
  assert.equal(isOrderNewsEvent(row(1, "cancelled", "10"), transfer(1, { cancelled_by: "system" })), true);
});

test("evenements ignores : paiement carte, annulation non automatique, action de la cliente, statut inconnu", () => {
  assert.equal(isOrderNewsEvent(row(1, "paid", "10"), card(1)), false);
  assert.equal(isOrderNewsEvent(row(1, "cancelled", "10"), transfer(1, { cancelled_by: "customer" })), false);
  assert.equal(isOrderNewsEvent(row(1, "cancelled", "10"), transfer(1, { cancelled_by: "admin" })), false);
  assert.equal(isOrderNewsEvent(row(1, "delivered", "10", { par_moi: true }), card(1)), false);
  assert.equal(isOrderNewsEvent(row(1, "pending", "10"), card(1)), false);
  assert.equal(isOrderNewsEvent(row(1, "shipped", "10"), undefined), false);
  assert.equal(isOrderNewsEvent(null, card(1)), false);
});

test("premiere visite : le point de depart est l'etat courant, donc 0 nouveaute", () => {
  const rows = [row(1, "paid", "01"), row(1, "shipped", "03"), row(1, "delivered", "05")];
  const orders = [card(1)];
  const store = fillBaseline(emptyStore(), rows, []);
  assert.equal(store.orders, Date.parse(T("05")));
  assert.deepEqual(store.reviews, {});
  assert.equal(countOrderNews(rows, orders, store), 0);
});

test("premiere visite sans aucune commande : point de depart a 0, la premiere expedition compte", () => {
  const store = fillBaseline(emptyStore(), [], []);
  assert.equal(store.orders, 0);
  assert.equal(countOrderNews([row(7, "shipped", "12")], [card(7)], store), 1);
});

test("expediee puis livree comptent 2 evenements, meme pour une seule commande", () => {
  const store = storeAt("04");
  const rows = [row(1, "paid", "01"), row(1, "shipped", "05"), row(1, "delivered", "06")];
  assert.equal(countOrderNews(rows, [card(1)], store), 2);
});

test("seul ce qui est posterieur au dernier vu compte (egalite exclue)", () => {
  const store = storeAt("05");
  const rows = [row(1, "shipped", "05"), row(1, "delivered", "06")];
  assert.equal(countOrderNews(rows, [card(1)], store), 1);
});

test("un paiement carte tout juste abouti ne declenche rien, un virement confirme si", () => {
  const store = storeAt("01");
  assert.equal(countOrderNews([row(1, "paid", "02")], [card(1)], store), 0);
  assert.equal(countOrderNews([row(2, "paid", "02")], [transfer(2)], store), 1);
});

test("commandes non affichees (carte non aboutie) ignorees", () => {
  const store = storeAt("01");
  assert.equal(countOrderNews([row(9, "shipped", "02")], [card(1)], store), 0);
});

test("annulation automatique comptee, annulation par la cliente non comptee", () => {
  const store = storeAt("01");
  const rows = [row(3, "cancelled", "02"), row(4, "cancelled", "02")];
  const orders = [transfer(3, { cancelled_by: "system", status: "cancelled" }), transfer(4, { cancelled_by: "customer", status: "cancelled" })];
  assert.equal(countOrderNews(rows, orders, store), 1);
});

test("action faite par la cliente elle-meme (confirmation de reception) non comptee", () => {
  const store = storeAt("01");
  assert.equal(countOrderNews([row(1, "delivered", "02", { par_moi: true })], [card(1)], store), 0);
});

test("lecture echouee (rows null) : aucun comptage, point de depart conserve a null", () => {
  const store = fillBaseline(emptyStore(), null, null);
  assert.equal(store.orders, null);
  assert.equal(store.reviews, null);
  assert.equal(countOrderNews(null, [card(1)], store), 0);
  assert.equal(countOrderNews([row(1, "shipped", "02")], [card(1)], store), 0);
  assert.equal(countReviewNews([{ id: 1, status: "published" }], store), 0);
});

test("point de depart complete plus tard sans tout declarer nouveau", () => {
  let store = fillBaseline(emptyStore(), null, [{ id: 1, status: "published", reply: null }]);
  assert.equal(store.orders, null);
  assert.deepEqual(store.reviews, { 1: "published|" });
  const rows = [row(1, "shipped", "03")];
  store = fillBaseline(store, rows, []);
  assert.equal(store.orders, Date.parse(T("03")));
  assert.equal(countOrderNews(rows, [card(1)], store), 0);
  assert.equal(fillBaseline(store, rows, []), store);
});

test("marquer les commandes comme vues : remet a zero et ne recule jamais", () => {
  const rows = [row(1, "shipped", "05"), row(1, "delivered", "06")];
  const store = storeAt("04");
  const seen = markOrdersSeen(store, rows);
  assert.equal(seen.orders, Date.parse(T("06")));
  assert.equal(countOrderNews(rows, [card(1)], seen), 0);
  assert.equal(markOrdersSeen(seen, rows), seen);
  assert.equal(markOrdersSeen(seen, [row(1, "shipped", "01")]), seen);
  assert.equal(markOrdersSeen(seen, []), seen);
  assert.equal(markOrdersSeen(emptyStore(), rows).orders, null);
});

test("avis : publie, refuse et reponse comptent une fois chacun ; en attente, retire et inchange non", () => {
  const before = [
    { id: 1, status: "pending", reply: null, reply_at: null },
    { id: 2, status: "published", reply: null, reply_at: null },
    { id: 3, status: "pending", reply: null, reply_at: null },
    { id: 4, status: "pending", reply: null, reply_at: null },
  ];
  const store = fillBaseline(emptyStore(), [], before);
  assert.equal(countReviewNews(before, store), 0);
  const after = [
    { id: 1, status: "published", reply: null, reply_at: null },
    { id: 2, status: "published", reply: "Merci !", reply_at: "2026-11-12T08:00:00Z" },
    { id: 3, status: "refused", reply: null, reply_at: null },
    { id: 4, status: "withdrawn", reply: null, reply_at: null },
    { id: 5, status: "pending", reply: null, reply_at: null },
    { id: 6, status: "published", reply: null, reply_at: null },
  ];
  assert.equal(countReviewNews(after, store), 4);
});

test("avis : une publication suivie d'une reponse ne compte qu'un seul avis", () => {
  const store = fillBaseline(emptyStore(), [], [{ id: 1, status: "pending", reply: null }]);
  const after = [{ id: 1, status: "published", reply: "Merci", reply_at: "2026-11-12T08:00:00Z" }];
  assert.equal(countReviewNews(after, store), 1);
});

test("marquer les avis comme vus : remet a zero, reste stable", () => {
  const store = fillBaseline(emptyStore(), [], [{ id: 1, status: "pending" }]);
  const after = [{ id: 1, status: "published", reply: null }];
  const seen = markReviewsSeen(store, after);
  assert.notEqual(seen, store);
  assert.equal(countReviewNews(after, seen), 0);
  assert.equal(markReviewsSeen(seen, after), seen);
  assert.equal(markReviewsSeen(emptyStore(), after).reviews, null);
});

test("signature d'avis : la reponse sans date reste distincte de l'absence de reponse", () => {
  assert.equal(reviewSignature({ status: "published", reply: null }), "published|");
  assert.equal(reviewSignature({ status: "published", reply: "x", reply_at: null }), "published|1");
  assert.equal(reviewSignature(null), "");
});

test("memoire locale : cle par compte, contenu invalide ignore", () => {
  assert.equal(storageKey("abc"), "zenoria_account_news_v1:abc");
  assert.notEqual(storageKey("a"), storageKey("b"));
  assert.equal(parseStore(null), null);
  assert.equal(parseStore(""), null);
  assert.equal(parseStore("pas du json"), null);
  assert.equal(parseStore(JSON.stringify({ v: 2, orders: 1, reviews: {} })), null);
  assert.deepEqual(parseStore(JSON.stringify({ v: 1, orders: 12, reviews: { 1: "published|" } })), { v: 1, orders: 12, reviews: { 1: "published|" } });
  assert.deepEqual(parseStore(JSON.stringify({ v: 1, orders: "x", reviews: [1] })), { v: 1, orders: null, reviews: null });
  assert.deepEqual(parseStore(JSON.stringify({ v: 1, orders: 5, reviews: { 1: 3, 2: "a|" } })), { v: 1, orders: 5, reviews: { 2: "a|" } });
});

test("dates invalides ignorees", () => {
  assert.equal(maxChangedAt([{ changed_at: "n'importe quoi" }, { changed_at: null }]), null);
  assert.equal(maxChangedAt(null), null);
  const store = storeAt("01");
  assert.equal(countOrderNews([{ order_id: 1, status: "shipped", changed_at: "oups" }], [card(1)], store), 0);
});

test("pastille plafonnee a 9+", () => {
  assert.equal(formatBadge(0), "");
  assert.equal(formatBadge(-2), "");
  assert.equal(formatBadge(NaN), "");
  assert.equal(formatBadge(1), "1");
  assert.equal(formatBadge(9), "9");
  assert.equal(formatBadge(10), "9+");
  assert.equal(formatBadge(250), "9+");
});
