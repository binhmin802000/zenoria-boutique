#!/usr/bin/env node
// ============================================================
// PATCH LOT 2g : « Mes favoris » (Mon compte) suit la même règle que la vitrine.
// Bague épuisée, en cours de commande ou pièce unique vendue -> « ✎ Écrivez-nous » (message prérempli adapté)
// à la place de « Ajouter au panier ». « Plus en vente » inchangé pour un produit désactivé.
// Modifie uniquement pages/compte.js. Aucune base de données.
//   node scripts/patch-lot2g-favoris.mjs --dry-run
//   node scripts/patch-lot2g-favoris.mjs --apply
// ============================================================
import fs from "node:fs";
const MARKER = "ZENORIA_FAV_STOCK_V1";
const mode = process.argv.includes("--apply") ? "apply" : process.argv.includes("--dry-run") ? "dry" : null;
const FILES = [
 {
  "path": "pages/compte.js",
  "patches": [
   {
    "name": "F1 imports",
    "find": [
     "import TransferInstructions from \"@/components/TransferInstructions\"; // ZENORIA_STEP3C2_V1"
    ],
    "replace": [
     "import TransferInstructions from \"@/components/TransferInstructions\"; // ZENORIA_STEP3C2_V1",
     "import { CatalogWriteUs } from \"@/components/ProductParts\"; // ZENORIA_FAV_STOCK_V1",
     "import { getAvailability, pieceStateMap, stockStateMap } from \"@/lib/shopUtils\";"
    ]
   },
   {
    "name": "F2 favoris : etat des pieces et disponible reel",
    "find": [
     "const prodRes = await supabase.from(\"products\").select(\"id, slug, name, price, promo_price, photos, active, stock, is_unique\").in(\"id\", ids);",
     "const byId = {};",
     "(prodRes.data || []).forEach((p) => { byId[p.id] = { ...p, promoPrice: p.promo_price }; });"
    ],
    "replace": [
     "        // ZENORIA_FAV_STOCK_V1 : même règle que la vitrine (stock, paiements en cours, pièces uniques réservées ou vendues)",
     "        const [prodRes, pieceRes, availRes] = await Promise.all([",
     "          supabase.from(\"products\").select(\"id, slug, name, price, promo_price, photos, active, stock, is_unique\").in(\"id\", ids),",
     "          supabase.rpc(\"public_piece_states\").then((r) => r, () => ({ data: null, error: true })),",
     "          supabase.rpc(\"public_stock_states\").then((r) => r, () => ({ data: null, error: true })),",
     "        ]);",
     "        const pieceMap = pieceStateMap(pieceRes && !pieceRes.error ? pieceRes.data : null);",
     "        const availMap = availRes && !availRes.error && Array.isArray(availRes.data) ? stockStateMap(availRes.data) : null;",
     "        const byId = {};",
     "        (prodRes.data || []).forEach((p) => {",
     "          byId[p.id] = {",
     "            ...p,",
     "            promoPrice: p.promo_price,",
     "            isUnique: p.is_unique === true,",
     "            pieceState: pieceMap.get(p.id) || null,",
     "            available: availMap && availMap.has(p.id) ? availMap.get(p.id) : null,",
     "          };",
     "        });"
    ]
   },
   {
    "name": "F3 bouton : Ecrivez-nous si non commandable",
    "find": [
     "<button type=\"button\" onClick={() => addFavoriteToCart(p)} disabled={!p.active || (p.is_unique !== true && !(Number(p.stock) > 0))} className=\"rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-3 py-1 text-xs disabled:opacity-50\">",
     "{!p.active ? \"Plus en vente\" : p.is_unique !== true && !(Number(p.stock) > 0) ? \"Épuisé\" : \"Ajouter au panier\"}",
     "</button>"
    ],
    "replace": [
     "                              {!p.active ? (",
     "                                <button type=\"button\" disabled className=\"rounded-full bg-[#8f6075] text-white px-3 py-1 text-xs opacity-50\">Plus en vente</button>",
     "                              ) : getAvailability(p).orderable ? (",
     "                                <button type=\"button\" onClick={() => addFavoriteToCart(p)} className=\"rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-3 py-1 text-xs\">Ajouter au panier</button>",
     "                              ) : (",
     "                                <CatalogWriteUs product={p} contactSettings={contactCfg} compact /> /* ZENORIA_FAV_STOCK_V1 : épuisé, en cours de commande ou vendue */",
     "                              )}"
    ]
   }
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
  if (content.includes(MARKER)) fail(f.path + " : le patch est deja applique.");
  for (const p of f.patches) { const c = (content.match(toRegex(p.find)) || []).length; console.log((c === 1 ? "  OK  " : " ERREUR ") + p.name + " : " + c + " occurrence(s)"); if (c !== 1) problems.push(p.name + " (" + c + ")"); }
  if (!problems.length) for (const p of f.patches) content = content.replace(toRegex(p.find), () => p.replace.join("\n"));
  results.push({ f, content, crlf });
}
if (problems.length) fail("verifier :\n  - " + problems.join("\n  - "));
const r0 = results[0].content;
for (const n of ["CatalogWriteUs product={p} contactSettings={contactCfg} compact", "public_stock_states", "getAvailability(p).orderable"]) if (!r0.includes(n)) fail("controle final : « " + n + " » absent.");
if (mode === "dry") { console.log("\nDRY-RUN termine : conforme. Rien n'a ete ecrit."); process.exit(0); }
for (const r of results) fs.writeFileSync(r.f.path, r.crlf ? r.content.replace(/\n/g, "\r\n") : r.content, "utf8");
console.log("\nPATCH APPLIQUE. Retour arriere avant commit : git restore pages/compte.js");
