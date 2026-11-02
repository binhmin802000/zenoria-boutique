#!/usr/bin/env node
// ============================================================
// PATCH LOT 2c-1 : affichage du stock (composants partages, sans changement des pages)
// Remplace : lib/shopUtils.js (plus de fabrication sur commande)
// Modifie  : components/ProductParts.js, components/ProductSheet.js, components/QuizResult.js,
//            lib/quizState.js (isUnique transmis au quiz), pages/admin.js (stock par defaut a 0)
// Aucune base de donnees. A deployer AVEC le lot 2c-2 (pages : panier, lecture des pieces, contact du quiz).
//
//   node scripts/patch-lot2c1-affichage.mjs --dry-run
//   node scripts/patch-lot2c1-affichage.mjs --apply
// ============================================================
import fs from "node:fs";
const MARKER = "ZENORIA_STOCK_UI_V1";
const mode = process.argv.includes("--apply") ? "apply" : process.argv.includes("--dry-run") ? "dry" : null;
const FILES = [
 {
  "path": "lib/shopUtils.js",
  "kind": "replace",
  "mustContain": [
   "export const BACKORDER_LEAD_TIME",
   "export function getAvailability",
   "export const formatPrice"
  ],
  "content": "// ZENORIA_STOCK_UI_V1\n// ============================================================================\n// ZENORIA — Outils de la boutique partagés entre l'accueil (pages/index.js) et la page du quiz (pages/quiz.js)\n// Logique pure : aucun React, aucune classe Tailwind.\n// ============================================================================\nexport const formatPrice = (n) =>\n  n.toLocaleString(\"fr-FR\", { style: \"currency\", currency: \"EUR\" });\n// ============================================================\n// DISPONIBILITÉ D'UNE BAGUE (lot 2c : stock reel uniquement)\n//\n// Bijou normal : le seul stock est celui saisi dans l'administration.\n//   - stock > 0          -> « Disponible » (commandable)\n//   - stock = 0          -> « Épuisé » (non commandable : « Écrivez-nous »)\n//   - quantité > stock   -> « Disponible », état \"insufficient\" (le panier demande de réduire la quantité)\n//   Aucune quantité n'est affichée (choix validé : pas de chiffre visible par la cliente).\n//\n// Pièce unique : la disponibilité vient des réservations (product.pieceState, fourni par la page\n// à partir de la fonction publique public_piece_states). Sans cette information, la pièce est\n// considérée comme disponible : c'est le serveur (reserve_order_items) qui protège la vente.\n//   - \"reserved\" -> réservée par une autre cliente (non commandable)\n//   - \"sold\"     -> vendue (non commandable)\n//\n// Le serveur reste la seule garantie : un affichage en retard n'entraîne jamais de vente au-delà du stock.\n// ============================================================\nexport function getAvailability(product, qty = 0) {\n  const p = product || {};\n  if (p.isUnique === true) {\n    if (p.pieceState === \"sold\") return { state: \"sold\", orderable: false, stock: 0, label: \"Vendue\", detail: \"\" };\n    if (p.pieceState === \"reserved\") return { state: \"reserved\", orderable: false, stock: 0, label: \"Réservée\", detail: \"\" };\n    return { state: \"in-stock\", orderable: true, stock: 1, label: \"Disponible\", detail: \"\" };\n  }\n  const stock = typeof p.stock === \"number\" && Number.isFinite(p.stock) ? Math.max(0, Math.floor(p.stock)) : 0;\n  if (stock <= 0) {\n    return { state: \"out-of-stock\", orderable: false, stock, label: \"Épuisé\", detail: \"N'est plus disponible : retirez cet article pour continuer.\" };\n  }\n  if (qty > stock) {\n    return { state: \"insufficient\", orderable: true, stock, label: \"Disponible\", detail: \"Quantité supérieure au stock : réduisez-la pour continuer.\" };\n  }\n  return { state: \"in-stock\", orderable: true, stock, label: \"Disponible\", detail: \"\" };\n}\n",
  "finals": [
   "ZENORIA_STOCK_UI_V1",
   "orderable"
  ],
  "forbidden": [
   "BACKORDER_LEAD_TIME",
   "sur commande"
  ]
 },
 {
  "path": "components/ProductParts.js",
  "kind": "anchors",
  "patches": [
   {
    "name": "P1 import des liens de contact",
    "find": [
     "import { formatPrice, getAvailability } from \"@/lib/shopUtils\";"
    ],
    "replace": [
     "import { formatPrice, getAvailability } from \"@/lib/shopUtils\";",
     "import { buildMailtoLink, buildWhatsAppLink } from \"@/lib/contactSettings\"; // ZENORIA_STOCK_UI_V1"
    ]
   },
   {
    "name": "P2 pastille + encarts « épuisé » et « pièce unique »",
    "find": [
     "// Pastille de disponibilité",
     "export function AvailabilityBadge({ product, qty = 0, showDetail = false }) {",
     "const a = getAvailability(product, qty);",
     "const color = a.state === \"in-stock\" ? \"bg-emerald-50 text-emerald-700\" : \"bg-amber-50 text-amber-700\";",
     "const dot = a.state === \"in-stock\" ? \"bg-emerald-500\" : \"bg-amber-500\";",
     "return (",
     "<span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ${color}`}>",
     "<span className={`h-1.5 w-1.5 rounded-full ${dot}`} />",
     "{a.label}",
     "{showDetail && a.detail ? ` · ${a.detail}` : \"\"}",
     "</span>",
     ");",
     "}"
    ],
    "replace": [
     "// ZENORIA_STOCK_UI_V1 : pastille de disponibilité (plus de fabrication sur commande, aucun chiffre affiché)",
     "export function AvailabilityBadge({ product, qty = 0, showDetail = false }) {",
     "  const a = getAvailability(product, qty);",
     "  const tone =",
     "    a.state === \"in-stock\"",
     "      ? { color: \"bg-emerald-50 text-emerald-700\", dot: \"bg-emerald-500\" }",
     "      : a.state === \"out-of-stock\" || a.state === \"sold\"",
     "      ? { color: \"bg-[#eeeaec] text-[#6b5f66]\", dot: \"bg-[#9d9197]\" }",
     "      : { color: \"bg-amber-50 text-amber-700\", dot: \"bg-amber-500\" };",
     "  return (",
     "    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ${tone.color}`}>",
     "      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />",
     "      {a.label}",
     "      {showDetail && a.detail ? ` · ${a.detail}` : \"\"}",
     "    </span>",
     "  );",
     "}",
     "// Lien « Écrivez-nous » : e-mail en priorité, sinon WhatsApp ; null si aucun canal n'est actif ou si la page n'a pas fourni les réglages",
     "export function contactLink(contactSettings, subject, emailBody, waText) {",
     "  const c = contactSettings || {};",
     "  const email = c.email && c.email.enabled && typeof c.email.value === \"string\" ? c.email.value.trim() : \"\";",
     "  const wa = c.whatsapp && c.whatsapp.enabled && typeof c.whatsapp.value === \"string\" ? c.whatsapp.value.trim() : \"\";",
     "  if (email) return { href: buildMailtoLink(email, subject, emailBody), external: false };",
     "  if (wa) return { href: buildWhatsAppLink(wa, waText), external: true };",
     "  return null;",
     "}",
     "// Bijou normal épuisé : remplace le bouton « Ajouter au panier » (texte validé)",
     "export function UnavailableNotice({ product, contactSettings }) {",
     "  if (!product) return null;",
     "  const link = contactLink(",
     "    contactSettings,",
     "    `À propos de « ${product.name} »`,",
     "    `Bonjour,\\n\\nJe souhaite savoir si « ${product.name} » sera de nouveau disponible. Pouvez-vous me prévenir ?\\n`,",
     "    `Bonjour, je souhaite savoir si « ${product.name} » sera de nouveau disponible. Pouvez-vous me prévenir ?`",
     "  );",
     "  return (",
     "    <p data-testid=\"product-unavailable\" className=\"mt-7 text-sm leading-6 text-[#54434c] rounded-xl bg-[#f5edf1] px-4 py-3\">",
     "      Cette création est actuellement épuisée.{\" \"}",
     "      {link ? (",
     "        <>",
     "          <a href={link.href} target={link.external ? \"_blank\" : undefined} rel=\"noopener noreferrer\" className=\"underline text-[#8f6075]\">Écrivez-nous</a>{\" \"}",
     "          pour savoir si elle sera de nouveau disponible.",
     "        </>",
     "      ) : (",
     "        \"Écrivez-nous pour savoir si elle sera de nouveau disponible.\"",
     "      )}",
     "    </p>",
     "  );",
     "}",
     "// Encart « pièce unique » à trois états (validé) : disponible, réservée, vendue",
     "export function PieceUniqueNotice({ product, contactSettings }) {",
     "  if (!product || product.isUnique !== true) return null;",
     "  const state = product.pieceState === \"sold\" ? \"sold\" : product.pieceState === \"reserved\" ? \"reserved\" : \"available\";",
     "  const base = \"text-sm leading-6 text-[#54434c] mt-4 rounded-xl bg-[#f5edf1] px-4 py-3\";",
     "  if (state === \"available\") {",
     "    return (",
     "      <p data-testid=\"unique-notice\" data-state=\"available\" className={base}>",
     "        <span className=\"font-medium\">✦ Pièce unique</span> — Façonnée une seule fois, elle ne sera jamais reproduite à l&apos;identique.",
     "      </p>",
     "    );",
     "  }",
     "  if (state === \"reserved\") {",
     "    const link = contactLink(",
     "      contactSettings,",
     "      `À propos de « ${product.name} »`,",
     "      `Bonjour,\\n\\nLa pièce unique « ${product.name} » est réservée. Pourriez-vous me dire si elle se libère ?\\n`,",
     "      `Bonjour, la pièce unique « ${product.name} » est réservée. Pourriez-vous me dire si elle se libère ?`",
     "    );",
     "    return (",
     "      <p data-testid=\"unique-notice\" data-state=\"reserved\" className={base}>",
     "        <span className=\"font-medium\">✦ Pièce unique</span> — Cette pièce unique est réservée par une autre cliente, dans l&apos;attente de son paiement. Si cette réservation n&apos;aboutit pas, elle pourra être de nouveau proposée.",
     "        {link && (",
     "          <>",
     "            {\" \"}",
     "            <a href={link.href} target={link.external ? \"_blank\" : undefined} rel=\"noopener noreferrer\" className=\"underline text-[#8f6075]\">Nous écrire</a>",
     "          </>",
     "        )}",
     "      </p>",
     "    );",
     "  }",
     "  const link = contactLink(",
     "    contactSettings,",
     "    `À propos de « ${product.name} »`,",
     "    `Bonjour,\\n\\nLe modèle « ${product.name} » m'a touchée, et j'aimerais en savoir plus sur une création qui s'en inspire.\\n`,",
     "    `Bonjour, le modèle « ${product.name} » m'a touchée, j'aimerais en savoir plus sur une création qui s'en inspire.`",
     "  );",
     "  return (",
     "    <p data-testid=\"unique-notice\" data-state=\"sold\" className={base}>",
     "      <span className=\"font-medium\">✦ Pièce unique</span> — Façonnée une seule fois, elle ne sera jamais reproduite à l&apos;identique.{\" \"}",
     "      {link ? (",
     "        <>",
     "          Elle vous touche ?{\" \"}",
     "          <a href={link.href} target={link.external ? \"_blank\" : undefined} rel=\"noopener noreferrer\" className=\"underline text-[#8f6075]\">Écrivez-nous</a>",
     "          {\" \"}: nous pouvons imaginer une création qui s&apos;en inspire.",
     "        </>",
     "      ) : (",
     "        \"Contactez-nous pour en savoir plus sur une création qui s'en inspire.\"",
     "      )}",
     "    </p>",
     "  );",
     "}"
    ]
   }
  ],
  "finals": [
   "ZENORIA_STOCK_UI_V1",
   "export function UnavailableNotice",
   "export function PieceUniqueNotice",
   "export function contactLink"
  ],
  "forbidden": []
 },
 {
  "path": "components/ProductSheet.js",
  "kind": "anchors",
  "patches": [
   {
    "name": "S1 imports",
    "find": [
     "import { ProductMedia, PriceTag, AvailabilityBadge } from \"@/components/ProductParts\";"
    ],
    "replace": [
     "import { ProductMedia, PriceTag, AvailabilityBadge, UnavailableNotice } from \"@/components/ProductParts\";",
     "import { getAvailability } from \"@/lib/shopUtils\"; // ZENORIA_STOCK_UI_V1"
    ]
   },
   {
    "name": "S2 nouvelle propriete contactSettings (facultative)",
    "find": [
     "uniqueNotice = null }) {"
    ],
    "replace": [
     "uniqueNotice = null, contactSettings = null }) {"
    ]
   },
   {
    "name": "S3 bouton remplace si la bague n'est pas commandable",
    "find": [
     "<button",
     "onClick={() => onAdd && onAdd(product)}",
     "data-testid=\"product-sheet-add\"",
     "className=\"w-full mt-7 rounded-full h-12 bg-[#855a6f] hover:bg-[#6f4a5c] text-white text-sm font-medium transition\"",
     ">",
     "{addLabel}",
     "</button>"
    ],
    "replace": [
     "{/* ZENORIA_STOCK_UI_V1 : bouton seulement si la bague est commandable ; épuisée -> « Écrivez-nous » ; pièce unique réservée/vendue -> l'encart uniqueNotice explique */}",
     "              {getAvailability(product).orderable ? (",
     "                <button",
     "                  onClick={() => onAdd && onAdd(product)}",
     "                  data-testid=\"product-sheet-add\"",
     "                  className=\"w-full mt-7 rounded-full h-12 bg-[#855a6f] hover:bg-[#6f4a5c] text-white text-sm font-medium transition\"",
     "                >",
     "                  {addLabel}",
     "                </button>",
     "              ) : product.isUnique === true ? null : (",
     "                <UnavailableNotice product={product} contactSettings={contactSettings} />",
     "              )}"
    ]
   }
  ],
  "finals": [
   "ZENORIA_STOCK_UI_V1",
   "getAvailability(product).orderable",
   "contactSettings = null"
  ],
  "forbidden": []
 },
 {
  "path": "components/QuizResult.js",
  "kind": "anchors",
  "patches": [
   {
    "name": "Q1 import",
    "find": [
     "import { OCCASIONS, AVOID, outfitFor, occasionByKey, flatteringGarment } from \"@/lib/quizOutfits\";"
    ],
    "replace": [
     "import { OCCASIONS, AVOID, outfitFor, occasionByKey, flatteringGarment } from \"@/lib/quizOutfits\";",
     "import { getAvailability } from \"@/lib/shopUtils\"; // ZENORIA_STOCK_UI_V1"
    ]
   },
   {
    "name": "Q2 bouton du quiz seulement si commandable",
    "find": [
     "{prod && (",
     "<button type=\"button\" onClick={() => onAdd(prod)} data-testid=\"quiz-add\" className=\"rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-4 py-1.5 text-sm\">",
     "Ajouter au panier",
     "</button>",
     ")}"
    ],
    "replace": [
     "{prod && (getAvailability(prod).orderable ? (",
     "                      <button type=\"button\" onClick={() => onAdd(prod)} data-testid=\"quiz-add\" className=\"rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-4 py-1.5 text-sm\">",
     "                        Ajouter au panier",
     "                      </button>",
     "                    ) : (",
     "                      <span data-testid=\"quiz-unavailable\" className=\"self-center text-sm text-[#8b737e]\">Actuellement indisponible</span>",
     "                    ))}"
    ]
   }
  ],
  "finals": [
   "ZENORIA_STOCK_UI_V1",
   "quiz-unavailable"
  ],
  "forbidden": []
 },
 {
  "path": "lib/quizState.js",
  "kind": "anchors",
  "patches": [
   {
    "name": "Z1 le quiz connait aussi les pieces uniques",
    "find": [
     "stock: Number.isFinite(r.stock) ? r.stock : 0,"
    ],
    "replace": [
     "stock: Number.isFinite(r.stock) ? r.stock : 0,",
     "      isUnique: r.is_unique === true, // ZENORIA_STOCK_UI_V1"
    ]
   }
  ],
  "finals": [
   "ZENORIA_STOCK_UI_V1"
  ],
  "forbidden": []
 },
 {
  "path": "pages/admin.js",
  "kind": "anchors",
  "patches": [
   {
    "name": "A1 stock d'un nouveau produit a 0",
    "find": [
     "stock: 5,"
    ],
    "replace": [
     "stock: 0, // ZENORIA_STOCK_UI_V1 : pas de stock par défaut, c'est l'administration qui le saisit"
    ]
   }
  ],
  "finals": [
   "ZENORIA_STOCK_UI_V1"
  ],
  "forbidden": [
   "stock: 5,"
  ]
 }
];
function fail(m) { console.error("\nECHEC : " + m); console.error("Aucun fichier n'a ete modifie."); process.exit(1); }
if (!mode) fail("indiquez --dry-run ou --apply.");
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const toRegex = (lines) => new RegExp(esc(lines.map((l) => l.trim()).join("\n")).replace(/\s+/g, "\\s+"), "g");
console.log("Mode : " + (mode === "apply" ? "APPLICATION" : "DRY-RUN (aucune ecriture)") + "\n");
const results = []; const problems = [];
for (const f of FILES) {
  if (!fs.existsSync(f.path)) fail(f.path + " est introuvable. Lancez la commande depuis la racine du projet (dossier zenoria).");
  const original = fs.readFileSync(f.path, "utf8");
  const crlf = original.includes("\r\n");
  let content = original.replace(/\r\n/g, "\n");
  console.log(f.path + " (fins de ligne " + (crlf ? "Windows CRLF" : "Unix LF") + ")");
  if (content.includes(MARKER)) fail(f.path + " : le patch est deja applique (marqueur " + MARKER + " present).");
  const before = problems.length;
  if (f.kind === "replace") {
    for (const n of f.mustContain) { const ok = content.includes(n); console.log((ok ? "  OK  " : " ERREUR ") + "contenu attendu : " + n); if (!ok) problems.push(f.path + " : contenu attendu absent : " + n); }
    if (problems.length === before) content = f.content;
  } else {
    for (const p of f.patches) { const c = (content.match(toRegex(p.find)) || []).length; console.log((c === 1 ? "  OK  " : " ERREUR ") + p.name + " : " + c + " occurrence(s)"); if (c !== 1) problems.push(f.path + " : " + p.name + " (" + c + " occurrence(s) au lieu de 1)"); }
    if (problems.length === before) for (const p of f.patches) content = content.replace(toRegex(p.find), () => p.replace.join("\n"));
  }
  results.push({ f, content, crlf });
}
if (problems.length) fail("verifier :\n  - " + problems.join("\n  - "));
for (const r of results) {
  for (const n of r.f.finals) if (!r.content.includes(n)) fail("controle final " + r.f.path + " : « " + n + " » absent apres patch.");
  for (const b of r.f.forbidden) if (r.content.includes(b)) fail("controle final " + r.f.path + " : « " + b + " » encore present apres patch.");
}
if (mode === "dry") { console.log("\nDRY-RUN termine : les " + FILES.length + " fichiers sont conformes. Rien n'a ete ecrit."); process.exit(0); }
for (const r of results) fs.writeFileSync(r.f.path, r.crlf ? r.content.replace(/\n/g, "\r\n") : r.content, "utf8");
console.log("\nPATCH APPLIQUE : " + results.length + " fichiers modifies.");
console.log("Retour arriere avant commit : git restore lib/shopUtils.js lib/quizState.js components/ProductParts.js components/ProductSheet.js components/QuizResult.js pages/admin.js");
