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
  eventFloor,
  orderNewsByOrder,
  countOrderNews,
  newsOrderIds,
  reviewSignature,
  newReviewIds,
  countReviewNews,
  fillBaseline,
  markOrderSeen,
  markOrdersSeen,
  markReviewsSeen,
  formatBadge,
} from "../lib/accountNews.js";

const T = (s) => "2026-11-" + s + "T10:00:00+00:00";
const row = (order_id, status, day, extra = {}) => ({ order_id, status, changed_at: T(day), note: null, visible: true, par_moi: false, ...extra });
const transfer = (id, extra = {}) => ({ id, payment_method: "transfer", status: "pending_transfer", cancelled_by: null, ...extra });
const card = (id, extra = {}) => ({ id, payment_method: "card", status: "paid", cancelled_by: null, ...extra });
const storeAt = (orders, reviews = {}, seen = {}) => ({ v: 1, orders: Date.parse(T(orders)), seen, reviews });

// ---------- V1 : evenements et point de depart ----------

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
  const store = fillBaseline(emptyStore(), rows, []);
  assert.equal(store.orders, Date.parse(T("05")));
  assert.deepEqual(store.seen, {});
  assert.deepEqual(store.reviews, {});
  assert.equal(countOrderNews(rows, [card(1)], store), 0);
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
  assert.equal(eventFloor(store, 1), null);
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

// ---------- V2 : une commande est « vue » quand on ouvre son detail ----------

test("V2 : nouveautes reparties par commande", () => {
  const store = storeAt("04");
  const rows = [row(1, "shipped", "05"), row(1, "delivered", "06"), row(2, "paid", "07"), row(3, "shipped", "03")];
  const orders = [card(1), transfer(2), card(3)];
  assert.deepEqual(orderNewsByOrder(rows, orders, store), { 1: 2, 2: 1 });
  assert.equal(countOrderNews(rows, orders, store), 3);
});

test("V2 : ouvrir une commande ne remet a zero que celle-la", () => {
  const store = storeAt("04");
  const rows = [row(1, "shipped", "05"), row(1, "delivered", "06"), row(2, "paid", "07")];
  const orders = [card(1), transfer(2)];
  const after = markOrderSeen(store, 1, rows);
  assert.notEqual(after, store);
  assert.deepEqual(after.seen, { 1: Date.parse(T("06")) });
  assert.deepEqual(orderNewsByOrder(rows, orders, after), { 2: 1 });
  assert.equal(after.orders, store.orders);
});

test("V2 : une nouveaute posterieure a l'ouverture compte a nouveau", () => {
  const store = storeAt("04");
  const rows = [row(1, "shipped", "05")];
  const seen = markOrderSeen(store, 1, rows);
  assert.equal(countOrderNews(rows, [card(1)], seen), 0);
  const rows2 = rows.concat([row(1, "delivered", "09")]);
  assert.equal(countOrderNews(rows2, [card(1)], seen), 1);
});

test("V2 : markOrderSeen stable (meme objet), ne recule jamais, tolere les cas limites", () => {
  const store = storeAt("04");
  const rows = [row(1, "shipped", "05")];
  const seen = markOrderSeen(store, 1, rows);
  assert.equal(markOrderSeen(seen, 1, rows), seen);
  assert.equal(markOrderSeen(seen, 1, [row(1, "shipped", "02")]), seen);
  assert.equal(markOrderSeen(store, 1, []), store);
  assert.equal(markOrderSeen(store, 99, rows), store);
  assert.equal(markOrderSeen(store, null, rows), store);
  assert.equal(markOrderSeen(store, 1, null), store);
  assert.equal(markOrderSeen(emptyStore(), 1, rows).orders, null);
  assert.equal(markOrderSeen(null, 1, rows), null);
});

test("V2 : l'identifiant de commande peut etre un nombre ou un texte", () => {
  const store = storeAt("04");
  const rows = [row("12", "shipped", "05")];
  const orders = [card(12)];
  assert.deepEqual(orderNewsByOrder(rows, orders, store), { 12: 1 });
  assert.equal(markOrderSeen(store, 12, rows).seen["12"], Date.parse(T("05")));
});

test("V2 : plancher de commande = le plus eleve entre le depart du compte et la derniere ouverture", () => {
  const store = storeAt("04", {}, { 1: Date.parse(T("08")), 2: Date.parse(T("02")) });
  assert.equal(eventFloor(store, 1), Date.parse(T("08")));
  assert.equal(eventFloor(store, 2), Date.parse(T("04")));
  assert.equal(eventFloor(store, 3), Date.parse(T("04")));
});

test("V2 : commandes a ouvrir, la plus recemment concernee d'abord, type de l'identifiant conserve", () => {
  const store = storeAt("01");
  const rows = [row(1, "shipped", "05"), row(2, "shipped", "09"), row(3, "shipped", "07"), row(4, "paid", "08")];
  const orders = [card(1), card(2), card(3), card(4)];
  assert.deepEqual(newsOrderIds(rows, orders, store), [2, 3, 1]);
  assert.deepEqual(newsOrderIds([row(1, "shipped", "05")], [card(1)], store), [1]);
  assert.deepEqual(newsOrderIds([], [card(1)], store), []);
  assert.deepEqual(newsOrderIds(null, null, store), []);
});

test("V2 : une seule commande a du nouveau -> un seul identifiant (ouverture directe)", () => {
  const store = storeAt("04");
  const rows = [row(1, "shipped", "05"), row(1, "delivered", "06"), row(2, "shipped", "03")];
  assert.deepEqual(newsOrderIds(rows, [card(1), card(2)], store), [1]);
  assert.deepEqual(newsOrderIds(rows, [card(1), card(2)], markOrderSeen(store, 1, rows)), []);
});

test("marquer toutes les commandes comme vues (fonction conservee) : ne recule jamais", () => {
  const rows = [row(1, "shipped", "05"), row(1, "delivered", "06")];
  const store = storeAt("04");
  const seen = markOrdersSeen(store, rows);
  assert.equal(seen.orders, Date.parse(T("06")));
  assert.equal(markOrdersSeen(seen, rows), seen);
  assert.equal(markOrdersSeen(seen, [row(1, "shipped", "01")]), seen);
  assert.equal(markOrdersSeen(seen, []), seen);
  assert.equal(markOrdersSeen(emptyStore(), rows).orders, null);
});

// ---------- Avis ----------

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
  assert.deepEqual(newReviewIds(after, store), ["1", "2", "3", "6"]);
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
  assert.deepEqual(newReviewIds(after, seen), []);
  assert.equal(markReviewsSeen(seen, after), seen);
  assert.equal(markReviewsSeen(emptyStore(), after).reviews, null);
});

test("signature d'avis : la reponse sans date reste distincte de l'absence de reponse", () => {
  assert.equal(reviewSignature({ status: "published", reply: null }), "published|");
  assert.equal(reviewSignature({ status: "published", reply: "x", reply_at: null }), "published|1");
  assert.equal(reviewSignature(null), "");
});

// ---------- Memoire locale ----------

test("memoire locale : cle par compte, contenu invalide ignore", () => {
  assert.equal(storageKey("abc"), "zenoria_account_news_v1:abc");
  assert.notEqual(storageKey("a"), storageKey("b"));
  assert.equal(parseStore(null), null);
  assert.equal(parseStore(""), null);
  assert.equal(parseStore("pas du json"), null);
  assert.equal(parseStore(JSON.stringify({ v: 2, orders: 1, reviews: {} })), null);
  assert.deepEqual(parseStore(JSON.stringify({ v: 1, orders: "x", reviews: [1] })), { v: 1, orders: null, seen: {}, reviews: null });
  assert.deepEqual(parseStore(JSON.stringify({ v: 1, orders: 5, reviews: { 1: 3, 2: "a|" } })), { v: 1, orders: 5, seen: {}, reviews: { 2: "a|" } });
});

test("memoire V1 deja enregistree (sans « seen ») : lue telle quelle, sans perte", () => {
  const old = '{"v":1,"orders":1794432978807,"reviews":{"7":"published|","8":"published|","9":"published|"}}';
  assert.deepEqual(parseStore(old), { v: 1, orders: 1794432978807, seen: {}, reviews: { 7: "published|", 8: "published|", 9: "published|" } });
  assert.deepEqual(parseStore(JSON.stringify({ v: 1, orders: 5, seen: { 1: 9, 2: "x", 3: null }, reviews: {} })).seen, { 1: 9 });
  assert.deepEqual(parseStore(JSON.stringify({ v: 1, orders: 5, seen: [1], reviews: {} })).seen, {});
  const rt = parseStore(JSON.stringify(storeAt("04", { 1: "published|" }, { 3: 77 })));
  assert.deepEqual(rt.seen, { 3: 77 });
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
