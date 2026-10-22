// ============================================================
// GÉNÉRATION DU PDF DE FACTURE — ZENORIA_INVOICE_STEP3_V1
//
// Fonction pure (sans Next.js, sans React) : reçoit les données déjà figées d'une facture
// (table invoices, voir supabase_invoices.sql) et les lignes de la commande, renvoie les octets
// d'un PDF A4, dans la mise en page validée (maquette_facture_*.pdf).
//
// N'invente aucune donnée : un champ vendeur vide (nom, adresse, SIRET, n° de TVA) affiche
// « À compléter » en évidence, jamais un blanc silencieux.
//
// Logo : public/images/logo-facture.png (PNG, fond blanc ou transparent). Si le fichier est
// absent ou illisible, le nom « ZENORIA » est affiché en texte à la place — le PDF reste généré.
// ============================================================

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "node:fs";
import path from "node:path";

const COLORS = {
  plum: rgb(0x41 / 255, 0x2f / 255, 0x3b / 255),
  rose: rgb(0x8f / 255, 0x60 / 255, 0x75 / 255),
  text: rgb(0x34 / 255, 0x2b / 255, 0x32 / 255),
  muted: rgb(0x70 / 255, 0x65 / 255, 0x6a / 255),
  line: rgb(0xee / 255, 0xe2 / 255, 0xe5 / 255),
  box: rgb(0xfb / 255, 0xf7 / 255, 0xf9 / 255),
  amber: rgb(0xfd / 255, 0xf0 / 255, 0xcf / 255),
  amberText: rgb(0x8a / 255, 0x61 / 255, 0x16 / 255),
  white: rgb(1, 1, 1),
};
const PAGE_W = 595.28; // A4 portrait, en points
const PAGE_H = 841.89;
const MARGIN = 42;

const eur = (n) => `${Number(n || 0).toFixed(2).replace(".", ",")} €`;
const fmtDate = (value) => {
  if (!value) return "";
  const d = new Date(value);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Paris" });
};

function measure(font, text, size) {
  return font.widthOfTextAtSize(String(text), size);
}

// Dessine un "chip" ambré type <span class="todo"> pour un champ manquant
function todoChip(page, font, x, y, size = 9) {
  const text = "À compléter";
  const w = measure(font, text, size) + 10;
  page.drawRectangle({ x, y: y - 2, width: w, height: size + 4, color: COLORS.amber });
  page.drawText(text, { x: x + 5, y, size, font, color: COLORS.amberText });
  return w;
}

export async function generateInvoicePdf({ invoice, orderItems, carrier, trackingNumber }) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);

  let y = PAGE_H - MARGIN;
  const left = MARGIN;
  const right = PAGE_W - MARGIN;
  const innerW = right - left;

  // ---------- En-tête : logo + bloc "Facture" ----------
  let logoDrawn = false;
  try {
    const logoPath = path.join(process.cwd(), "public", "images", "logo-facture.png");
    const bytes = fs.readFileSync(logoPath);
    const png = await doc.embedPng(bytes);
    const targetH = 30;
    const scale = targetH / png.height;
    page.drawImage(png, { x: left, y: y - targetH, width: png.width * scale, height: targetH });
    logoDrawn = true;
  } catch (e) {
    // logo absent ou illisible : on affiche le nom en texte, le PDF reste généré
  }
  if (!logoDrawn) {
    page.drawText("ZENORIA", { x: left, y: y - 18, size: 20, font: bold, color: COLORS.plum });
  }

  const title = "Facture";
  page.drawText(title, { x: right - measure(bold, title, 18), y: y - 14, size: 18, font: bold, color: COLORS.plum });
  const numTxt = invoice.number;
  page.drawText(numTxt, { x: right - measure(bold, numTxt, 12), y: y - 32, size: 12, font: bold, color: COLORS.rose });
  const dateTxt = `Émise le ${fmtDate(invoice.issued_at)}`;
  page.drawText(dateTxt, { x: right - measure(regular, dateTxt, 9), y: y - 46, size: 9, font: regular, color: COLORS.muted });

  y -= 56;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 1.4, color: COLORS.plum });
  y -= 24;

  // ---------- Deux encadrés : Vendeur / Client ----------
  const boxH = 100;
  const boxW = (innerW - 16) / 2;
  page.drawRectangle({ x: left, y: y - boxH, width: boxW, height: boxH, color: COLORS.box });
  page.drawRectangle({ x: left + boxW + 16, y: y - boxH, width: boxW, height: boxH, color: COLORS.box });

  const padX = 12;
  let vy = y - 18;
  page.drawText("VENDEUR", { x: left + padX, y: vy, size: 9, font: bold, color: COLORS.rose });
  vy -= 16;
  page.drawText("Nom :", { x: left + padX, y: vy, size: 10, font: bold, color: COLORS.text });
  if (invoice.seller_name) {
    page.drawText(invoice.seller_name, { x: left + padX + measure(bold, "Nom : ", 10), y: vy, size: 10, font: regular, color: COLORS.text });
  } else {
    todoChip(page, regular, left + padX + measure(bold, "Nom : ", 10), vy, 9);
  }
  vy -= 15;
  page.drawText("Entrepreneur individuel (EI)", { x: left + padX, y: vy, size: 9.5, font: regular, color: COLORS.text });
  vy -= 15;
  page.drawText("Adresse :", { x: left + padX, y: vy, size: 9.5, font: regular, color: COLORS.text });
  if (invoice.seller_address) {
    page.drawText(invoice.seller_address, { x: left + padX + measure(regular, "Adresse : ", 9.5), y: vy, size: 9.5, font: regular, color: COLORS.text });
  } else {
    todoChip(page, regular, left + padX + measure(regular, "Adresse : ", 9.5), vy, 9);
  }
  vy -= 15;
  page.drawText("SIRET :", { x: left + padX, y: vy, size: 9.5, font: regular, color: COLORS.text });
  if (invoice.seller_siret) {
    page.drawText(invoice.seller_siret, { x: left + padX + measure(regular, "SIRET : ", 9.5), y: vy, size: 9.5, font: regular, color: COLORS.text });
  } else {
    todoChip(page, regular, left + padX + measure(regular, "SIRET : ", 9.5), vy, 9);
  }
  vy -= 16;
  if (invoice.vat_applicable) {
    const vatLine = invoice.seller_vat_number ? `N° TVA : ${invoice.seller_vat_number}` : "N° TVA intracommunautaire : ";
    if (invoice.seller_vat_number) {
      page.drawText(vatLine, { x: left + padX, y: vy, size: 9.5, font: regular, color: COLORS.text });
    } else {
      page.drawText("N° TVA intracommunautaire :", { x: left + padX, y: vy, size: 9.5, font: regular, color: COLORS.text });
      todoChip(page, regular, left + padX + measure(regular, "N° TVA intracommunautaire : ", 9.5), vy, 9);
    }
  } else {
    page.drawText("TVA non applicable, art. 293 B du CGI", { x: left + padX, y: vy, size: 9.5, font: regular, color: COLORS.text });
  }

  let cy = y - 18;
  const cx = left + boxW + 16 + padX;
  page.drawText("CLIENT", { x: cx, y: cy, size: 9, font: bold, color: COLORS.rose });
  cy -= 16;
  page.drawText(invoice.customer_name || "—", { x: cx, y: cy, size: 10, font: bold, color: COLORS.text });
  cy -= 15;
  if (invoice.customer_address_line1) { page.drawText(invoice.customer_address_line1, { x: cx, y: cy, size: 9.5, font: regular, color: COLORS.text }); cy -= 13; }
  if (invoice.customer_address_line2) { page.drawText(invoice.customer_address_line2, { x: cx, y: cy, size: 9.5, font: regular, color: COLORS.text }); cy -= 13; }
  page.drawText(`${invoice.customer_postal_code || ""} ${invoice.customer_city || ""}`.trim(), { x: cx, y: cy, size: 9.5, font: regular, color: COLORS.text });
  cy -= 13;
  page.drawText(invoice.customer_country || "", { x: cx, y: cy, size: 9.5, font: regular, color: COLORS.text });
  cy -= 16;
  page.drawText(`Commande ${invoice.order_reference || ""}`, { x: cx, y: cy, size: 9, font: regular, color: COLORS.muted });

  y -= boxH + 22;

  // ---------- Tableau des bijoux ----------
  const colBijou = left;
  const colQty = left + innerW * 0.52;
  const colPu = left + innerW * 0.68;
  const colTot = left + innerW * 0.86;
  const rowH = 22;

  page.drawRectangle({ x: left, y: y - 20, width: innerW, height: 20, color: COLORS.plum });
  page.drawText("BIJOU", { x: colBijou + 8, y: y - 14, size: 9, font: bold, color: COLORS.white });
  const qH = "QUANTITÉ"; page.drawText(qH, { x: colQty + (innerW * 0.16 - measure(bold, qH, 9)) - 8, y: y - 14, size: 9, font: bold, color: COLORS.white });
  const puH = "PRIX UNITAIRE"; page.drawText(puH, { x: colPu + (innerW * 0.18 - measure(bold, puH, 9)) - 8, y: y - 14, size: 9, font: bold, color: COLORS.white });
  const totH = "TOTAL"; page.drawText(totH, { x: right - 8 - measure(bold, totH, 9), y: y - 14, size: 9, font: bold, color: COLORS.white });
  y -= 20;

  (orderItems || []).forEach((it) => {
    y -= rowH;
    page.drawText(String(it.product_name || "Bijou").slice(0, 60), { x: colBijou + 8, y: y + 7, size: 9.5, font: regular, color: COLORS.text });
    const qtyTxt = String(it.qty);
    page.drawText(qtyTxt, { x: colQty + (innerW * 0.16 - measure(regular, qtyTxt, 9.5)) - 8, y: y + 7, size: 9.5, font: regular, color: COLORS.text });
    const puTxt = eur(it.product_price);
    page.drawText(puTxt, { x: colPu + (innerW * 0.18 - measure(regular, puTxt, 9.5)) - 8, y: y + 7, size: 9.5, font: regular, color: COLORS.text });
    const totTxt = eur(Number(it.product_price) * Number(it.qty));
    page.drawText(totTxt, { x: right - 8 - measure(regular, totTxt, 9.5), y: y + 7, size: 9.5, font: regular, color: COLORS.text });
    page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.6, color: COLORS.line });
  });
  y -= 14;

  // ---------- Totaux ----------
  const totBoxW = 230;
  const totX = right - totBoxW;
  const lineTot = (label, value, opts = {}) => {
    y -= opts.big ? 20 : 15;
    if (opts.big) page.drawLine({ start: { x: totX, y: y + 12 }, end: { x: right, y: y + 12 }, thickness: 1.2, color: COLORS.plum });
    page.drawText(label, { x: totX, y, size: opts.big ? 11.5 : 9.5, font: opts.big ? bold : regular, color: opts.big ? COLORS.plum : COLORS.muted });
    page.drawText(value, { x: right - measure(opts.big ? bold : regular, value, opts.big ? 11.5 : 9.5), y, size: opts.big ? 11.5 : 9.5, font: opts.big ? bold : regular, color: opts.big ? COLORS.plum : COLORS.text });
  };
  if (invoice.vat_applicable) {
    lineTot("Sous-total HT", eur(invoice.subtotal_ht));
    lineTot("TVA (" + Number(invoice.vat_rate) + " %)", eur(invoice.vat_amount));
  } else {
    lineTot("Sous-total", eur(invoice.subtotal_ht));
  }
  if (Number(invoice.discount) > 0) lineTot("Remise", "- " + eur(invoice.discount));
  lineTot("Livraison", Number(invoice.shipping) > 0 ? eur(invoice.shipping) : "Offerte");
  lineTot(invoice.vat_applicable ? "Total payé (TTC)" : "Total payé", eur(invoice.total_ttc), { big: true });
  y -= 18;
  const note = invoice.vat_applicable
    ? `Prix affiché inchangé (${eur(invoice.total_ttc)}) : TVA de ${Number(invoice.vat_rate)} % incluse dans ce montant`
    : "TVA non applicable, art. 293 B du CGI — montant net de TVA";
  page.drawText(note, { x: right - measure(italic, note, 8.5), y, size: 8.5, font: italic, color: COLORS.muted });

  // ---------- Livraison ----------
  if (carrier) {
    y -= 26;
    const boxH2 = 30;
    page.drawRectangle({ x: left, y: y - boxH2, width: innerW, height: boxH2, color: COLORS.box });
    const shipTxt = `${carrier}${trackingNumber ? " · n° de suivi " + trackingNumber : ""}`;
    page.drawText("LIVRAISON", { x: left + padX, y: y - 12, size: 8.5, font: bold, color: COLORS.rose });
    page.drawText(shipTxt, { x: left + padX, y: y - 25, size: 9.5, font: regular, color: COLORS.text });
  }

  // ---------- Pied de page ----------
  const footerY = MARGIN + 36;
  page.drawLine({ start: { x: left, y: footerY + 14 }, end: { x: right, y: footerY + 14 }, thickness: 0.6, color: COLORS.line });
  const f1 = "Facture émise automatiquement par le site Zenoria — conservez-la pour vos démarches.";
  page.drawText(f1, { x: left, y: footerY, size: 7.5, font: regular, color: COLORS.muted });
  const sellerDone = invoice.seller_name && invoice.seller_address && invoice.seller_siret && (!invoice.vat_applicable || invoice.seller_vat_number);
  if (!sellerDone) {
    const f2 = "Entrepreneur individuel (EI) — informations du vendeur à compléter avant mise en ligne réelle.";
    page.drawText(f2, { x: left, y: footerY - 11, size: 7.5, font: regular, color: COLORS.amberText });
  }

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
