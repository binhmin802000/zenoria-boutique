// ============================================================
// GÉNÉRATION DU PDF D'EXPORT DES DONNÉES PERSONNELLES (RGPD)
//
// Fonction pure (sans Next.js, sans React) : reçoit le JSON renvoyé par la
// fonction SQL get_my_data_export(), renvoie les octets d'un PDF A4 listant
// les commandes, avis et favoris de la cliente.
//
// Reprend exactement le style visuel de lib/invoicePdf.js (couleurs,
// logo, mise en page) pour la cohérence de marque.
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

function loadLogoBytes() {
  try {
    const logoPath = path.join(process.cwd(), "public", "images", "logo-facture.png");
    return fs.readFileSync(logoPath);
  } catch (e) {
    return null;
  }
}

export async function generateDataExportPdf({ userEmail, exportedAt, orders = [], reviews = [], favorites = [] }) {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const logoBytes = loadLogoBytes();
  let logoImage = null;
  if (logoBytes) {
    try { logoImage = await doc.embedPng(logoBytes); } catch (e) { logoImage = null; }
  }

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  function newPageIfNeeded(minSpace = 80) {
    if (y < MARGIN + minSpace) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  }

  // En-tête : logo ou nom en texte
  if (logoImage) {
    const logoH = 28;
    const logoW = (logoImage.width / logoImage.height) * logoH;
    page.drawImage(logoImage, { x: MARGIN, y: y - logoH, width: logoW, height: logoH });
  } else {
    page.drawText("ZENORIA", { x: MARGIN, y: y - 20, size: 20, font: bold, color: COLORS.plum });
  }
  y -= 44;

  page.drawText("Export de vos données personnelles", { x: MARGIN, y, size: 16, font: bold, color: COLORS.plum });
  y -= 20;
  page.drawText(`Compte : ${userEmail || ""}`, { x: MARGIN, y, size: 10, font: regular, color: COLORS.muted });
  y -= 14;
  page.drawText(`Export généré le ${fmtDate(exportedAt)}`, { x: MARGIN, y, size: 10, font: regular, color: COLORS.muted });
  y -= 24;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1, color: COLORS.line });
  y -= 24;

  // --- Section Commandes ---
  page.drawText("Vos commandes", { x: MARGIN, y, size: 13, font: bold, color: COLORS.plum });
  y -= 18;
  if (orders.length === 0) {
    page.drawText("Aucune commande enregistrée.", { x: MARGIN, y, size: 10, font: italic, color: COLORS.muted });
    y -= 18;
  } else {
    for (const o of orders) {
      newPageIfNeeded(90);
      page.drawRectangle({ x: MARGIN, y: y - 58, width: PAGE_W - 2 * MARGIN, height: 58, color: COLORS.box });
      page.drawText(`Commande n°${o.reference}`, { x: MARGIN + 8, y: y - 14, size: 10, font: bold, color: COLORS.text });
      page.drawText(`${fmtDate(o.created_at)} · ${o.status} · ${eur(o.total)}`, { x: MARGIN + 8, y: y - 28, size: 9, font: regular, color: COLORS.muted });
      const addr = [o.shipping_full_name, o.shipping_address_line1, o.shipping_postal_code, o.shipping_city].filter(Boolean).join(", ");
      page.drawText(addr ? `Livraison : ${addr}` : "Livraison : (anonymisée)", { x: MARGIN + 8, y: y - 42, size: 8, font: regular, color: COLORS.muted });
      const itemsText = (o.items || []).map((it) => `${it.qty}× ${it.product_name}`).join(" · ");
      page.drawText(itemsText || "", { x: MARGIN + 8, y: y - 54, size: 8, font: italic, color: COLORS.muted });
      y -= 66;
    }
  }
  y -= 10;

  // --- Section Avis ---
  newPageIfNeeded(60);
  page.drawText("Vos avis", { x: MARGIN, y, size: 13, font: bold, color: COLORS.plum });
  y -= 18;
  if (reviews.length === 0) {
    page.drawText("Aucun avis déposé.", { x: MARGIN, y, size: 10, font: italic, color: COLORS.muted });
    y -= 18;
  } else {
    for (const r of reviews) {
      newPageIfNeeded(40);
      page.drawText(`${"★".repeat(r.rating || 0)} — ${fmtDate(r.created_at)} (${r.status})`, { x: MARGIN, y, size: 9, font: bold, color: COLORS.text });
      y -= 12;
      if (r.comment) {
        page.drawText(r.comment.slice(0, 110), { x: MARGIN, y, size: 8, font: regular, color: COLORS.muted });
        y -= 14;
      }
      y -= 6;
    }
  }
  y -= 10;

  // --- Section Favoris ---
  newPageIfNeeded(40);
  page.drawText("Vos favoris", { x: MARGIN, y, size: 13, font: bold, color: COLORS.plum });
  y -= 18;
  if (favorites.length === 0) {
    page.drawText("Aucun favori enregistré.", { x: MARGIN, y, size: 10, font: italic, color: COLORS.muted });
  } else {
    page.drawText(`${favorites.length} bijou(x) en favori, ajoutés entre le ${fmtDate(favorites[favorites.length - 1]?.created_at)} et le ${fmtDate(favorites[0]?.created_at)}.`, { x: MARGIN, y, size: 9, font: regular, color: COLORS.muted });
  }

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}