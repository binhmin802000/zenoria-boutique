// ============================================================
// scripts/patch-facture-etape3.mjs — FACTURATION, étape 3 (génération du PDF + bouton côté cliente)
// ZENORIA_INVOICE_STEP3_V1
//
// Prérequis : étapes 1 (SQL : invoice_counters, invoices, issue_invoice_for_order) et 2
// (AdminBilling) déjà en place. npm install pdf-lib déjà exécuté.
//
// Usage (dossier zenoria, branche facturation-pdf) :
//   node scripts\patch-facture-etape3.mjs --dry-run
//   node scripts\patch-facture-etape3.mjs
//
// Crée  : lib/invoicePdf.js, pages/api/invoice/[orderId].js
// Modifie : pages/compte.js (bouton « Télécharger la facture » dans le détail de commande)
//
// Logo : si public/images/logo-facture.png n'existe pas, le PDF affiche « ZENORIA » en texte à la
// place (aucune erreur). Déposez votre logo à cet emplacement pour qu'il apparaisse sur la facture.
//
// Le bouton admin (components/AdminCrm.js) sera ajouté par un script séparé (patch-facture-etape3b),
// une fois l'emplacement exact de la liste des commandes confirmé.
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const MARK = "ZENORIA_INVOICE_STEP3_V1";
const BRANCH = "facturation-pdf";
const DRY = process.argv.includes("--dry-run");
const NEW_FILES = {
  "lib/invoicePdf.js": "// ============================================================\n// GÉNÉRATION DU PDF DE FACTURE — ZENORIA_INVOICE_STEP3_V1\n//\n// Fonction pure (sans Next.js, sans React) : reçoit les données déjà figées d'une facture\n// (table invoices, voir supabase_invoices.sql) et les lignes de la commande, renvoie les octets\n// d'un PDF A4, dans la mise en page validée (maquette_facture_*.pdf).\n//\n// N'invente aucune donnée : un champ vendeur vide (nom, adresse, SIRET, n° de TVA) affiche\n// « À compléter » en évidence, jamais un blanc silencieux.\n//\n// Logo : public/images/logo-facture.png (PNG, fond blanc ou transparent). Si le fichier est\n// absent ou illisible, le nom « ZENORIA » est affiché en texte à la place — le PDF reste généré.\n// ============================================================\n\nimport { PDFDocument, StandardFonts, rgb } from \"pdf-lib\";\nimport fs from \"node:fs\";\nimport path from \"node:path\";\n\nconst COLORS = {\n  plum: rgb(0x41 / 255, 0x2f / 255, 0x3b / 255),\n  rose: rgb(0x8f / 255, 0x60 / 255, 0x75 / 255),\n  text: rgb(0x34 / 255, 0x2b / 255, 0x32 / 255),\n  muted: rgb(0x70 / 255, 0x65 / 255, 0x6a / 255),\n  line: rgb(0xee / 255, 0xe2 / 255, 0xe5 / 255),\n  box: rgb(0xfb / 255, 0xf7 / 255, 0xf9 / 255),\n  amber: rgb(0xfd / 255, 0xf0 / 255, 0xcf / 255),\n  amberText: rgb(0x8a / 255, 0x61 / 255, 0x16 / 255),\n  white: rgb(1, 1, 1),\n};\nconst PAGE_W = 595.28; // A4 portrait, en points\nconst PAGE_H = 841.89;\nconst MARGIN = 42;\n\nconst eur = (n) => `${Number(n || 0).toFixed(2).replace(\".\", \",\")} €`;\nconst fmtDate = (value) => {\n  if (!value) return \"\";\n  const d = new Date(value);\n  return d.toLocaleDateString(\"fr-FR\", { day: \"2-digit\", month: \"2-digit\", year: \"numeric\", timeZone: \"Europe/Paris\" });\n};\n\nfunction measure(font, text, size) {\n  return font.widthOfTextAtSize(String(text), size);\n}\n\n// Dessine un \"chip\" ambré type <span class=\"todo\"> pour un champ manquant\nfunction todoChip(page, font, x, y, size = 9) {\n  const text = \"À compléter\";\n  const w = measure(font, text, size) + 10;\n  page.drawRectangle({ x, y: y - 2, width: w, height: size + 4, color: COLORS.amber });\n  page.drawText(text, { x: x + 5, y, size, font, color: COLORS.amberText });\n  return w;\n}\n\nexport async function generateInvoicePdf({ invoice, orderItems, carrier, trackingNumber }) {\n  const doc = await PDFDocument.create();\n  const page = doc.addPage([PAGE_W, PAGE_H]);\n  const regular = await doc.embedFont(StandardFonts.Helvetica);\n  const bold = await doc.embedFont(StandardFonts.HelveticaBold);\n  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);\n\n  let y = PAGE_H - MARGIN;\n  const left = MARGIN;\n  const right = PAGE_W - MARGIN;\n  const innerW = right - left;\n\n  // ---------- En-tête : logo + bloc \"Facture\" ----------\n  let logoDrawn = false;\n  try {\n    const logoPath = path.join(process.cwd(), \"public\", \"images\", \"logo-facture.png\");\n    const bytes = fs.readFileSync(logoPath);\n    const png = await doc.embedPng(bytes);\n    const targetH = 30;\n    const scale = targetH / png.height;\n    page.drawImage(png, { x: left, y: y - targetH, width: png.width * scale, height: targetH });\n    logoDrawn = true;\n  } catch (e) {\n    // logo absent ou illisible : on affiche le nom en texte, le PDF reste généré\n  }\n  if (!logoDrawn) {\n    page.drawText(\"ZENORIA\", { x: left, y: y - 18, size: 20, font: bold, color: COLORS.plum });\n  }\n\n  const title = \"Facture\";\n  page.drawText(title, { x: right - measure(bold, title, 18), y: y - 14, size: 18, font: bold, color: COLORS.plum });\n  const numTxt = invoice.number;\n  page.drawText(numTxt, { x: right - measure(bold, numTxt, 12), y: y - 32, size: 12, font: bold, color: COLORS.rose });\n  const dateTxt = `Émise le ${fmtDate(invoice.issued_at)}`;\n  page.drawText(dateTxt, { x: right - measure(regular, dateTxt, 9), y: y - 46, size: 9, font: regular, color: COLORS.muted });\n\n  y -= 56;\n  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 1.4, color: COLORS.plum });\n  y -= 24;\n\n  // ---------- Deux encadrés : Vendeur / Client ----------\n  const boxH = 100;\n  const boxW = (innerW - 16) / 2;\n  page.drawRectangle({ x: left, y: y - boxH, width: boxW, height: boxH, color: COLORS.box });\n  page.drawRectangle({ x: left + boxW + 16, y: y - boxH, width: boxW, height: boxH, color: COLORS.box });\n\n  const padX = 12;\n  let vy = y - 18;\n  page.drawText(\"VENDEUR\", { x: left + padX, y: vy, size: 9, font: bold, color: COLORS.rose });\n  vy -= 16;\n  page.drawText(\"Nom :\", { x: left + padX, y: vy, size: 10, font: bold, color: COLORS.text });\n  if (invoice.seller_name) {\n    page.drawText(invoice.seller_name, { x: left + padX + measure(bold, \"Nom : \", 10), y: vy, size: 10, font: regular, color: COLORS.text });\n  } else {\n    todoChip(page, regular, left + padX + measure(bold, \"Nom : \", 10), vy, 9);\n  }\n  vy -= 15;\n  page.drawText(\"Entrepreneur individuel (EI)\", { x: left + padX, y: vy, size: 9.5, font: regular, color: COLORS.text });\n  vy -= 15;\n  page.drawText(\"Adresse :\", { x: left + padX, y: vy, size: 9.5, font: regular, color: COLORS.text });\n  if (invoice.seller_address) {\n    page.drawText(invoice.seller_address, { x: left + padX + measure(regular, \"Adresse : \", 9.5), y: vy, size: 9.5, font: regular, color: COLORS.text });\n  } else {\n    todoChip(page, regular, left + padX + measure(regular, \"Adresse : \", 9.5), vy, 9);\n  }\n  vy -= 15;\n  page.drawText(\"SIRET :\", { x: left + padX, y: vy, size: 9.5, font: regular, color: COLORS.text });\n  if (invoice.seller_siret) {\n    page.drawText(invoice.seller_siret, { x: left + padX + measure(regular, \"SIRET : \", 9.5), y: vy, size: 9.5, font: regular, color: COLORS.text });\n  } else {\n    todoChip(page, regular, left + padX + measure(regular, \"SIRET : \", 9.5), vy, 9);\n  }\n  vy -= 16;\n  if (invoice.vat_applicable) {\n    const vatLine = invoice.seller_vat_number ? `N° TVA : ${invoice.seller_vat_number}` : \"N° TVA intracommunautaire : \";\n    if (invoice.seller_vat_number) {\n      page.drawText(vatLine, { x: left + padX, y: vy, size: 9.5, font: regular, color: COLORS.text });\n    } else {\n      page.drawText(\"N° TVA intracommunautaire :\", { x: left + padX, y: vy, size: 9.5, font: regular, color: COLORS.text });\n      todoChip(page, regular, left + padX + measure(regular, \"N° TVA intracommunautaire : \", 9.5), vy, 9);\n    }\n  } else {\n    page.drawText(\"TVA non applicable, art. 293 B du CGI\", { x: left + padX, y: vy, size: 9.5, font: regular, color: COLORS.text });\n  }\n\n  let cy = y - 18;\n  const cx = left + boxW + 16 + padX;\n  page.drawText(\"CLIENT\", { x: cx, y: cy, size: 9, font: bold, color: COLORS.rose });\n  cy -= 16;\n  page.drawText(invoice.customer_name || \"—\", { x: cx, y: cy, size: 10, font: bold, color: COLORS.text });\n  cy -= 15;\n  if (invoice.customer_address_line1) { page.drawText(invoice.customer_address_line1, { x: cx, y: cy, size: 9.5, font: regular, color: COLORS.text }); cy -= 13; }\n  if (invoice.customer_address_line2) { page.drawText(invoice.customer_address_line2, { x: cx, y: cy, size: 9.5, font: regular, color: COLORS.text }); cy -= 13; }\n  page.drawText(`${invoice.customer_postal_code || \"\"} ${invoice.customer_city || \"\"}`.trim(), { x: cx, y: cy, size: 9.5, font: regular, color: COLORS.text });\n  cy -= 13;\n  page.drawText(invoice.customer_country || \"\", { x: cx, y: cy, size: 9.5, font: regular, color: COLORS.text });\n  cy -= 16;\n  page.drawText(`Commande ${invoice.order_reference || \"\"}`, { x: cx, y: cy, size: 9, font: regular, color: COLORS.muted });\n\n  y -= boxH + 22;\n\n  // ---------- Tableau des bijoux ----------\n  const colBijou = left;\n  const colQty = left + innerW * 0.52;\n  const colPu = left + innerW * 0.68;\n  const colTot = left + innerW * 0.86;\n  const rowH = 22;\n\n  page.drawRectangle({ x: left, y: y - 20, width: innerW, height: 20, color: COLORS.plum });\n  page.drawText(\"BIJOU\", { x: colBijou + 8, y: y - 14, size: 9, font: bold, color: COLORS.white });\n  const qH = \"QUANTITÉ\"; page.drawText(qH, { x: colQty + (innerW * 0.16 - measure(bold, qH, 9)) - 8, y: y - 14, size: 9, font: bold, color: COLORS.white });\n  const puH = \"PRIX UNITAIRE\"; page.drawText(puH, { x: colPu + (innerW * 0.18 - measure(bold, puH, 9)) - 8, y: y - 14, size: 9, font: bold, color: COLORS.white });\n  const totH = \"TOTAL\"; page.drawText(totH, { x: right - 8 - measure(bold, totH, 9), y: y - 14, size: 9, font: bold, color: COLORS.white });\n  y -= 20;\n\n  (orderItems || []).forEach((it) => {\n    y -= rowH;\n    page.drawText(String(it.product_name || \"Bijou\").slice(0, 60), { x: colBijou + 8, y: y + 7, size: 9.5, font: regular, color: COLORS.text });\n    const qtyTxt = String(it.qty);\n    page.drawText(qtyTxt, { x: colQty + (innerW * 0.16 - measure(regular, qtyTxt, 9.5)) - 8, y: y + 7, size: 9.5, font: regular, color: COLORS.text });\n    const puTxt = eur(it.product_price);\n    page.drawText(puTxt, { x: colPu + (innerW * 0.18 - measure(regular, puTxt, 9.5)) - 8, y: y + 7, size: 9.5, font: regular, color: COLORS.text });\n    const totTxt = eur(Number(it.product_price) * Number(it.qty));\n    page.drawText(totTxt, { x: right - 8 - measure(regular, totTxt, 9.5), y: y + 7, size: 9.5, font: regular, color: COLORS.text });\n    page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.6, color: COLORS.line });\n  });\n  y -= 14;\n\n  // ---------- Totaux ----------\n  const totBoxW = 230;\n  const totX = right - totBoxW;\n  const lineTot = (label, value, opts = {}) => {\n    y -= opts.big ? 20 : 15;\n    if (opts.big) page.drawLine({ start: { x: totX, y: y + 12 }, end: { x: right, y: y + 12 }, thickness: 1.2, color: COLORS.plum });\n    page.drawText(label, { x: totX, y, size: opts.big ? 11.5 : 9.5, font: opts.big ? bold : regular, color: opts.big ? COLORS.plum : COLORS.muted });\n    page.drawText(value, { x: right - measure(opts.big ? bold : regular, value, opts.big ? 11.5 : 9.5), y, size: opts.big ? 11.5 : 9.5, font: opts.big ? bold : regular, color: opts.big ? COLORS.plum : COLORS.text });\n  };\n  if (invoice.vat_applicable) {\n    lineTot(\"Sous-total HT\", eur(invoice.subtotal_ht));\n    lineTot(\"TVA (\" + Number(invoice.vat_rate) + \" %)\", eur(invoice.vat_amount));\n  } else {\n    lineTot(\"Sous-total\", eur(invoice.subtotal_ht));\n  }\n  if (Number(invoice.discount) > 0) lineTot(\"Remise\", \"- \" + eur(invoice.discount));\n  lineTot(\"Livraison\", Number(invoice.shipping) > 0 ? eur(invoice.shipping) : \"Offerte\");\n  lineTot(invoice.vat_applicable ? \"Total payé (TTC)\" : \"Total payé\", eur(invoice.total_ttc), { big: true });\n  y -= 18;\n  const note = invoice.vat_applicable\n    ? `Prix affiché inchangé (${eur(invoice.total_ttc)}) : TVA de ${Number(invoice.vat_rate)} % incluse dans ce montant`\n    : \"TVA non applicable, art. 293 B du CGI — montant net de TVA\";\n  page.drawText(note, { x: right - measure(italic, note, 8.5), y, size: 8.5, font: italic, color: COLORS.muted });\n\n  // ---------- Livraison ----------\n  if (carrier) {\n    y -= 26;\n    const boxH2 = 30;\n    page.drawRectangle({ x: left, y: y - boxH2, width: innerW, height: boxH2, color: COLORS.box });\n    const shipTxt = `${carrier}${trackingNumber ? \" · n° de suivi \" + trackingNumber : \"\"}`;\n    page.drawText(\"LIVRAISON\", { x: left + padX, y: y - 12, size: 8.5, font: bold, color: COLORS.rose });\n    page.drawText(shipTxt, { x: left + padX, y: y - 25, size: 9.5, font: regular, color: COLORS.text });\n  }\n\n  // ---------- Pied de page ----------\n  const footerY = MARGIN + 36;\n  page.drawLine({ start: { x: left, y: footerY + 14 }, end: { x: right, y: footerY + 14 }, thickness: 0.6, color: COLORS.line });\n  const f1 = \"Facture émise automatiquement par le site Zenoria — conservez-la pour vos démarches.\";\n  page.drawText(f1, { x: left, y: footerY, size: 7.5, font: regular, color: COLORS.muted });\n  const sellerDone = invoice.seller_name && invoice.seller_address && invoice.seller_siret && (!invoice.vat_applicable || invoice.seller_vat_number);\n  if (!sellerDone) {\n    const f2 = \"Entrepreneur individuel (EI) — informations du vendeur à compléter avant mise en ligne réelle.\";\n    page.drawText(f2, { x: left, y: footerY - 11, size: 7.5, font: regular, color: COLORS.amberText });\n  }\n\n  const bytes = await doc.save();\n  return Buffer.from(bytes);\n}\n",
  "pages/api/invoice/[orderId].js": "// ============================================================\n// pages/api/invoice/[orderId].js — GET : télécharge la facture PDF d'une commande\n// ZENORIA_INVOICE_STEP3_V1\n//\n// Authentification : le navigateur envoie l'en-tête « Authorization: Bearer <access_token> »\n// (le jeton de la session Supabase en cours, voir supabase.auth.getSession()). La route construit\n// un client Supabase qui REJOUE ce jeton (mêmes droits que si la cliente appelait directement) :\n// la fonction issue_invoice_for_order (SECURITY DEFINER) vérifie alors elle-même, côté base, que\n// la commande appartient à cette cliente, ou que le compte est administrateur. Aucune vérification\n// de propriété n'est refaite ici : la base reste la seule source de vérité pour cette règle.\n//\n// La facture n'est jamais stockée en fichier : elle est recomposée à chaque téléchargement à partir\n// des données figées de la table invoices (jamais modifiées après leur création, voir le verrou\n// invoices_lock_updates dans supabase_invoices.sql) et des lignes de la commande.\n// ============================================================\n\nimport { createClient } from \"@supabase/supabase-js\";\nimport { generateInvoicePdf } from \"@/lib/invoicePdf\";\nimport { formatOrderReference } from \"@/lib/orderDisplay\";\n\nconst SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;\nconst SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;\n\nexport default async function handler(req, res) {\n  res.setHeader(\"Cache-Control\", \"no-store, max-age=0\");\n  res.setHeader(\"X-Robots-Tag\", \"noindex\");\n\n  if (req.method !== \"GET\") {\n    res.setHeader(\"Allow\", \"GET\");\n    return res.status(405).json({ ok: false, error: \"méthode non autorisée\" });\n  }\n\n  const orderId = Number(req.query.orderId);\n  if (!Number.isInteger(orderId) || orderId <= 0) {\n    return res.status(400).json({ ok: false, error: \"identifiant de commande invalide\" });\n  }\n\n  const authHeader = req.headers.authorization || \"\";\n  const token = authHeader.startsWith(\"Bearer \") ? authHeader.slice(7) : \"\";\n  if (!token) {\n    return res.status(401).json({ ok: false, error: \"connexion requise\" });\n  }\n\n  // Client « au nom de » la personne connectée : PostgREST lira ce jeton pour auth.uid() et is_admin().\n  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {\n    global: { headers: { Authorization: `Bearer ${token}` } },\n    auth: { persistSession: false },\n  });\n\n  try {\n    const { data: invoice, error: issueErr } = await supabase\n      .rpc(\"issue_invoice_for_order\", { p_order_id: orderId })\n      .single();\n    if (issueErr) throw issueErr;\n    if (!invoice) return res.status(404).json({ ok: false, error: \"facture introuvable\" });\n\n    const [itemsRes, orderRes] = await Promise.all([\n      supabase.from(\"order_items\").select(\"product_name, product_price, qty\").eq(\"order_id\", orderId),\n      supabase.from(\"orders\").select(\"id, created_at, carrier, tracking_number\").eq(\"id\", orderId).maybeSingle(),\n    ]);\n    if (itemsRes.error) throw itemsRes.error;\n\n    const orderReference = orderRes.data ? formatOrderReference(orderRes.data) : `ZEN-${String(orderId).padStart(4, \"0\")}`;\n\n    const pdfBuffer = await generateInvoicePdf({\n      invoice: { ...invoice, order_reference: orderReference },\n      orderItems: itemsRes.data || [],\n      carrier: orderRes.data ? orderRes.data.carrier : null,\n      trackingNumber: orderRes.data ? orderRes.data.tracking_number : null,\n    });\n\n    res.setHeader(\"Content-Type\", \"application/pdf\");\n    res.setHeader(\"Content-Disposition\", `attachment; filename=\"${invoice.number}.pdf\"`);\n    return res.status(200).send(pdfBuffer);\n  } catch (err) {\n    const msg = (err && err.message) || String(err);\n    if (/NOT_AUTHENTICATED/.test(msg)) return res.status(401).json({ ok: false, error: \"connexion requise\" });\n    if (/NOT_ALLOWED/.test(msg)) return res.status(403).json({ ok: false, error: \"cette commande ne vous appartient pas\" });\n    if (/ORDER_NOT_FOUND/.test(msg)) return res.status(404).json({ ok: false, error: \"commande introuvable\" });\n    if (/ORDER_NOT_INVOICEABLE/.test(msg)) return res.status(409).json({ ok: false, error: \"cette commande n'est pas encore facturable\" });\n    return res.status(500).json({ ok: false, error: \"impossible de générer la facture pour le moment\" });\n  }\n}\n"
};

const ok = (m) => console.log("  \u2713 " + m);
const info = (m) => console.log("  \u00b7 " + m);
class Stop extends Error {}
const fail = (m) => { throw new Stop(m); };
const git = (cmd) => execSync(`git ${cmd}`, { encoding: "utf8" }).trim();

function read(rel) {
  if (!fs.existsSync(rel)) fail(`fichier introuvable : ${rel} (lancez le script depuis le dossier zenoria)`);
  let text = fs.readFileSync(rel, "utf8");
  const bom = text.charCodeAt(0) === 0xfeff;
  if (bom) text = text.slice(1);
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  return { rel, bom, eol, text: text.replace(/\r\n/g, "\n") };
}
const toDisk = (f, text) => (f.bom ? "\uFEFF" : "") + (f.eol === "\r\n" ? text.replace(/\n/g, "\r\n") : text);
function once(text, needle, replacer, label, file) {
  const n = text.split(needle).length - 1;
  if (n !== 1) fail(`repère « ${label} » trouvé ${n} fois dans ${file} (1 attendu)`);
  return text.replace(needle, replacer);
}

function patchCompte(t) {
  const f = "pages/compte.js";
  if (/onDownloadInvoice|ZENORIA_INVOICE_STEP3_V1/.test(t)) fail(`${f} contient déjà des éléments de facturation : vérifiez à la main`);

  // 1. Import des icônes supplémentaires
  t = once(
    t,
    'import { Home, Package, Star, Heart, UserCog, ShieldCheck, LogOut, Truck, RotateCw, ChevronLeft } from "lucide-react";',
    `import { Home, Package, Star, Heart, UserCog, ShieldCheck, LogOut, Truck, RotateCw, ChevronLeft, FileDown } from "lucide-react"; // ${MARK}\nimport { supabase as supabaseForInvoice } from "@/lib/supabase"; // ${MARK}`,
    "import lucide-react (icônes)",
    f
  );

  // 2. Fonction de téléchargement, ajoutée juste avant le composant OrderDetail
  const beforeOrderDetail = "function OrderDetail({ order, contactCfg, questionOpen, setQuestionOpen, onBack, onReorder, reorderBusy, reorderMsg }) {";
  const helper = [
    `// ${MARK} : télécharge la facture PDF d'une commande. Le jeton de la session en cours est`,
    `// transmis à la route API, qui vérifie elle-même (côté base) que la commande appartient`,
    `// bien à la cliente connectée, ou qu'il s'agit d'un accès administrateur.`,
    `async function downloadInvoice(orderId, onError) {`,
    `  try {`,
    `    const { data } = await supabaseForInvoice.auth.getSession();`,
    `    const token = data && data.session ? data.session.access_token : null;`,
    `    if (!token) { onError("Connectez-vous pour télécharger votre facture."); return; }`,
    `    const res = await fetch(\`/api/invoice/\${orderId}\`, { headers: { Authorization: \`Bearer \${token}\` } });`,
    `    if (!res.ok) {`,
    `      let message = "Impossible de générer la facture pour le moment.";`,
    `      try { const j = await res.json(); if (j && j.error) message = j.error; } catch (e) { /* réponse non JSON */ }`,
    `      onError(message);`,
    `      return;`,
    `    }`,
    `    const blob = await res.blob();`,
    `    const url = window.URL.createObjectURL(blob);`,
    `    const a = document.createElement("a");`,
    `    const match = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "");`,
    `    a.href = url;`,
    `    a.download = match ? match[1] : \`facture-\${orderId}.pdf\`;`,
    `    document.body.appendChild(a);`,
    `    a.click();`,
    `    a.remove();`,
    `    window.URL.revokeObjectURL(url);`,
    `  } catch (e) {`,
    `    onError("Impossible de générer la facture pour le moment.");`,
    `  }`,
    `}`,
    ``,
  ].join("\n");
  t = once(t, beforeOrderDetail, helper + beforeOrderDetail, "début de function OrderDetail", f);

  // 3. Nouveau paramètre et état local dans OrderDetail (bouton + erreur dédiée)
  t = once(
    t,
    "function OrderDetail({ order, contactCfg, questionOpen, setQuestionOpen, onBack, onReorder, reorderBusy, reorderMsg }) {\n  const info = orderStatusInfo(order.status);",
    `function OrderDetail({ order, contactCfg, questionOpen, setQuestionOpen, onBack, onReorder, reorderBusy, reorderMsg }) {\n  const [invoiceBusy, setInvoiceBusy] = useState(false); // ${MARK}\n  const [invoiceError, setInvoiceError] = useState(""); // ${MARK}\n  const info = orderStatusInfo(order.status);`,
    "début de OrderDetail (état info)",
    f
  );

  // 4. Le bouton lui-même, à côté de « Commander à nouveau »
  const oldButtons = `      <div className="flex flex-wrap gap-2 mt-4">
        <button type="button" onClick={() => onReorder(order)} disabled={reorderBusy} data-testid="reorder-btn" className="flex items-center gap-2 rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-4 h-10 text-sm disabled:opacity-50">
          <RotateCw size={15} /> Commander à nouveau
        </button>
        <button type="button" onClick={() => setQuestionOpen(questionOpen ? null : order.id)} className="rounded-full border border-[#d9c5cc] px-4 h-10 text-sm hover:bg-[#f5edf1]">
          Une question sur cette commande ?
        </button>
      </div>`;
  const newButtons = `      <div className="flex flex-wrap gap-2 mt-4">
        <button type="button" onClick={() => onReorder(order)} disabled={reorderBusy} data-testid="reorder-btn" className="flex items-center gap-2 rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-4 h-10 text-sm disabled:opacity-50">
          <RotateCw size={15} /> Commander à nouveau
        </button>
        <button type="button" onClick={() => setQuestionOpen(questionOpen ? null : order.id)} className="rounded-full border border-[#d9c5cc] px-4 h-10 text-sm hover:bg-[#f5edf1]">
          Une question sur cette commande ?
        </button>
        {/* ${MARK} : facture PDF, générée à la demande (recomposée depuis des données figées) */}
        <button
          type="button"
          onClick={async () => { setInvoiceBusy(true); setInvoiceError(""); await downloadInvoice(order.id, setInvoiceError); setInvoiceBusy(false); }}
          disabled={invoiceBusy}
          data-testid="invoice-download-btn"
          className="flex items-center gap-2 rounded-full border border-[#d9c5cc] px-4 h-10 text-sm hover:bg-[#f5edf1] disabled:opacity-50"
        >
          <FileDown size={15} /> {invoiceBusy ? "Génération…" : "Télécharger la facture"}
        </button>
      </div>
      {invoiceError && <div role="alert" className="mt-3 rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm">{invoiceError}</div>}`;
  t = once(t, oldButtons, newButtons, "boutons Commander à nouveau / Une question", f);

  return t;
}

try {
  console.log(`\nFacturation · étape 3 (génération du PDF)${DRY ? " — VÉRIFICATION SEULE" : ""}\n`);
  let branch = "";
  try { branch = git("rev-parse --abbrev-ref HEAD"); } catch (e) { fail("git introuvable ou dossier hors dépôt"); }
  if (branch !== BRANCH) fail(`branche actuelle « ${branch} » : passez sur ${BRANCH}`);
  ok(`branche ${BRANCH}`);

  if (!fs.existsSync("node_modules/pdf-lib")) fail("pdf-lib n'est pas installé : lancez d'abord npm install pdf-lib");
  ok("pdf-lib installé");
  if (!fs.existsSync("components/AdminBilling.js")) fail("l'étape 2 (AdminBilling) n'est pas appliquée");
  ok("étape 2 présente");

  const compte = read("pages/compte.js");
  if (!compte.text.includes("ZENORIA_ACCOUNT_STEP14_V1")) fail("pages/compte.js ne contient pas l'étape 1.4 : vérifiez la version du fichier");

  const touched = compte.text.includes(MARK) ? [] : ["pages/compte.js"];
  const dirty = touched.length ? git(`status --porcelain -- ${touched.join(" ")}`) : "";
  if (dirty) fail(`modifications locales non commitées :\n${dirty}\n  (commitez ou git restore avant de relancer)`);
  ok("pages/compte.js identique au dernier commit");

  if (!fs.existsSync("public/images/logo-facture.png")) info("public/images/logo-facture.png absent : la facture affichera « ZENORIA » en texte (pas bloquant)");

  const writes = [];
  const eol = compte.eol;
  for (const [rel, content] of Object.entries(NEW_FILES)) {
    if (fs.existsSync(rel)) {
      if (read(rel).text === content) { info(`${rel} : déjà présent, identique`); continue; }
      fail(`${rel} existe déjà avec un contenu différent : renommez-le ou supprimez-le, puis relancez`);
    }
    writes.push({ rel, data: eol === "\r\n" ? content.replace(/\n/g, "\r\n") : content, label: "créé" });
  }
  if (compte.text.includes(MARK)) info("pages/compte.js : déjà modifié, laissé tel quel");
  else writes.push({ rel: "pages/compte.js", data: toDisk(compte, patchCompte(compte.text)), label: "modifié (bouton Télécharger la facture)" });

  ok("tous les repères ont été trouvés");
  if (DRY) { console.log(`\nVérification réussie : ${writes.length} fichier(s) seraient écrits. Rien n'a été modifié.\n`); process.exit(0); }
  for (const w of writes) {
    fs.mkdirSync(path.dirname(w.rel), { recursive: true });
    fs.writeFileSync(w.rel, w.data, "utf8");
    ok(`${w.rel} ${w.label}`);
  }
  console.log(`\nTerminé : ${writes.length} fichier(s) écrit(s). Suite : npm run build, puis git status -sb.\n`);
} catch (e) {
  if (e instanceof Stop) { console.error(`\n\u2717 ARRÊT : ${e.message}\nAucun fichier n'a été modifié.\n`); process.exit(1); }
  throw e;
}
