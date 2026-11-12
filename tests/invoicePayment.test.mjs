// Tests de « Règlement » / « Payée le » sur la facture PDF (lib/invoicePdf.js).
// Lancer : node tests/invoicePayment.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { generateInvoicePdf, paymentMethodLabel, paymentDateText } from "../lib/invoicePdf.js";

const baseInvoice = {
  number: "ZEN-2026-0042",
  issued_at: "2026-11-12T10:00:00Z",
  vat_applicable: false,
  vat_rate: 0,
  subtotal_ht: 99.98,
  vat_amount: 0,
  shipping: 0,
  discount: 0,
  total_ttc: 99.98,
  seller_name: "Vendeuse Test",
  seller_address: "12 rue des Lilas, 75011 Paris",
  seller_siret: "123 456 789 00012",
  seller_vat_number: "",
  customer_name: "Camille Durand",
  customer_address_line1: "8 avenue des Fleurs",
  customer_postal_code: "69003",
  customer_city: "Lyon",
  customer_country: "France",
  order_reference: "ZEN-2026-1112-0204",
};
const items = [
  { product_name: "Bague Rose Bonbon", product_price: 49.99, qty: 1 },
  { product_name: "Bague Bleu Saphir", product_price: 49.99, qty: 1 },
];
const make = (over) => generateInvoicePdf({ invoice: { ...baseInvoice, ...over }, orderItems: items, carrier: null, trackingNumber: null });
const isPdf = (buf) => Buffer.isBuffer(buf) && buf.slice(0, 5).toString() === "%PDF-";

test("libelles du mode de reglement", () => {
  assert.equal(paymentMethodLabel("transfer"), "Virement bancaire");
  assert.equal(paymentMethodLabel("card"), "Carte bancaire");
  assert.equal(paymentMethodLabel(" TRANSFER "), "Virement bancaire");
});

test("mode inconnu : affiche la valeur enregistree, sans rien inventer", () => {
  assert.equal(paymentMethodLabel("cheque"), "cheque");
});

test("mode absent ou vide : chaine vide (le PDF affichera « À compléter »)", () => {
  assert.equal(paymentMethodLabel(null), "");
  assert.equal(paymentMethodLabel(undefined), "");
  assert.equal(paymentMethodLabel(""), "");
  assert.equal(paymentMethodLabel("   "), "");
  assert.equal(paymentMethodLabel(42), "");
});

test("date de paiement : format JJ/MM/AAAA, fuseau Europe/Paris", () => {
  assert.equal(paymentDateText("2026-11-12T14:05:00Z"), "12/11/2026");
  assert.equal(paymentDateText("2026-11-12T23:30:00Z"), "13/11/2026"); // minuit passe a Paris (UTC+1)
  assert.equal(paymentDateText("2026-07-12T22:30:00Z"), "13/07/2026"); // heure d'ete (UTC+2)
});

test("date absente ou invalide : chaine vide (le PDF affichera « À compléter »)", () => {
  assert.equal(paymentDateText(null), "");
  assert.equal(paymentDateText(undefined), "");
  assert.equal(paymentDateText(""), "");
  assert.equal(paymentDateText("pas une date"), "");
});

test("facture par virement : PDF genere", async () => {
  assert.ok(isPdf(await make({ payment_method: "transfer", paid_at: "2026-11-12T14:05:00Z" })));
});

test("facture par carte : PDF genere", async () => {
  assert.ok(isPdf(await make({ payment_method: "card", paid_at: "2026-11-12T08:20:00Z" })));
});

test("donnees de paiement absentes ou invalides : le PDF est quand meme genere", async () => {
  assert.ok(isPdf(await make({ payment_method: null, paid_at: null })));
  assert.ok(isPdf(await make({ payment_method: undefined, paid_at: undefined })));
  assert.ok(isPdf(await make({ payment_method: "transfer", paid_at: "pas une date" })));
});

test("avec TVA et bloc livraison : toujours genere", async () => {
  const pdf = await generateInvoicePdf({
    invoice: { ...baseInvoice, vat_applicable: true, vat_rate: 20, seller_vat_number: "FR12345678901", subtotal_ht: 83.32, vat_amount: 16.66, payment_method: "transfer", paid_at: "2026-11-12T14:05:00Z", delivery_shipped_at: "2026-11-13T09:30:00Z" },
    orderItems: items,
    carrier: "Colissimo",
    trackingNumber: "6A12345678901",
  });
  assert.ok(isPdf(pdf));
});
