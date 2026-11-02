#!/usr/bin/env node
// ============================================================
// PATCH LOT 2b (1/3) : pages/api/checkout.js — commande bloquante, reservation stock/pieces, plus de plafond fixe
// Modifie uniquement ce fichier. Reutilise reserve_order_items (lot 2a-bis, deja applique et teste).
//
// Changements :
//   - Suppression du plafond fixe de 10 (K2) : seul qty >= 1 reste controle, le stock reel protege la suite.
//   - La commande « pending » + order_items devient BLOQUANTE (K3) : en cas d'echec d'ecriture, la route
//     s'arrete avec une erreur 500 au lieu de continuer silencieusement vers Stripe (ancien filet de securite
//     webhook retire pour ce cas).
//   - Reservation de stock/pieces juste apres (reserve_order_items, 31 minutes) : en cas d'echec
//     (STOCK_UNAVAILABLE / PIECE_UNAVAILABLE), la commande qui vient d'etre creee est supprimee et la route
//     repond 409 avec un message clair et les identifiants concernes (meme principe que le lot 3b pour le virement).
//   - La session Stripe recoit expires_at pour expirer en meme temps que la reservation (K4).
//
// Usage, depuis la racine du projet (dossier zenoria) :
//   node scripts/patch-lot2b-checkout.mjs --dry-run   -> controle chaque repere, n'ecrit RIEN
//   node scripts/patch-lot2b-checkout.mjs --apply     -> ecrit si TOUT est conforme
// ============================================================
import fs from "node:fs";

const MARKER = "ZENORIA_STOCK_V1";
const mode = process.argv.includes("--apply") ? "apply" : process.argv.includes("--dry-run") ? "dry" : null;
const FILES = [
 {
  "path": "pages/api/checkout.js",
  "patches": [
   {
    "name": "K1 import : ajout de la lecture is_unique + regle de stock",
    "find": [
     ".select(\"id, name, price, promo_price, stock, active\")"
    ],
    "replace": [
     ".select(\"id, name, price, promo_price, stock, is_unique, active\")"
    ]
   },
   {
    "name": "K2 lignes du panier : conserve is_unique, plus de plafond fixe de 10 (qty >= 1 seulement)",
    "find": [
     "const qty = Math.max(1, Math.min(10, Math.floor(Number(it.qty) || 1))); // meme plafond que le site",
     "lines.push({",
     "product: {",
     "id: row.id,",
     "name: row.name,",
     "price: Number(row.price),",
     "promoPrice: row.promo_price !== null && row.promo_price !== undefined ? Number(row.promo_price) : null,",
     "},",
     "qty,",
     "});"
    ],
    "replace": [
     "const qty = Math.max(1, Math.floor(Number(it.qty) || 1)); // ZENORIA_STOCK_V1 : plus de plafond fixe, le stock reel (reserve_order_items) protege desormais la quantite",
     "      lines.push({",
     "        product: {",
     "          id: row.id,",
     "          name: row.name,",
     "          price: Number(row.price),",
     "          promoPrice: row.promo_price !== null && row.promo_price !== undefined ? Number(row.promo_price) : null,",
     "          isUnique: row.is_unique === true,",
     "        },",
     "        qty,",
     "      });"
    ]
   },
   {
    "name": "K3 commande pending + order_items : devient BLOQUANTE, reservation stock/pieces juste apres",
    "find": [
     "let pendingOrderId = null;",
     "try {",
     "const { data: pendingOrder, error: pendingErr } = await supabaseAdmin",
     ".from(\"orders\")",
     ".insert({",
     "user_id: checkoutUser ? checkoutUser.id : null,",
     "guest_email: \"en_attente@zenoria.local\", // temporaire : remplace par le vrai e-mail une fois le webhook confirme",
     "status: \"pending\",",
     "is_test: isTestOrderMode(), // ZENORIA_TEST_MODE_V1 : règle unique avec le virement (lib/testMode.js)",
     "subtotal: totals.subtotal,",
     "discount: totals.discount,",
     "shipping: totals.shipping,",
     "total: totals.total,",
     "promo_code: normalizedPromoCode || null,",
     "})",
     ".select(\"id\")",
     ".single();",
     "if (pendingErr) {",
     "console.error(\"[checkout] échec création commande pending :\", pendingErr.message);",
     "} else {",
     "pendingOrderId = pendingOrder.id;",
     "const pendingItems = lines.map((l) => ({",
     "order_id: pendingOrderId,",
     "product_id: l.product.id,",
     "product_name: l.product.name,",
     "product_price: effectivePrice(l.product),",
     "qty: l.qty,",
     "}));",
     "const { error: pendingItemsErr } = await supabaseAdmin.from(\"order_items\").insert(pendingItems);",
     "if (pendingItemsErr) {",
     "console.error(\"[checkout] échec création order_items (pending) :\", pendingItemsErr.message);",
     "}",
     "}",
     "} catch (e) {",
     "console.error(\"[checkout] erreur inattendue (commande pending) :\", e && e.message ? e.message : e);",
     "}"
    ],
    "replace": [
     "// ZENORIA_STOCK_V1 : la commande « pending » et sa reservation de stock/pieces deviennent BLOQUANTES.",
     "    // Si l'une de ces etapes echoue, on arrete tout AVANT la redirection vers Stripe (pas de commande orpheline,",
     "    // pas de paiement sur un article qui ne serait plus disponible). La reservation dure 31 minutes : la session",
     "    // Stripe est creee avec la meme duree (voir plus bas), pour que les deux expirent ensemble.",
     "    const RESERVATION_MINUTES = 31;",
     "    let pendingOrderId = null;",
     "    const { data: pendingOrder, error: pendingErr } = await supabaseAdmin",
     "      .from(\"orders\")",
     "      .insert({",
     "        user_id: checkoutUser ? checkoutUser.id : null,",
     "        guest_email: \"en_attente@zenoria.local\", // temporaire : remplace par le vrai e-mail une fois le webhook confirme",
     "        status: \"pending\",",
     "        is_test: isTestOrderMode(), // ZENORIA_TEST_MODE_V1 : règle unique avec le virement (lib/testMode.js)",
     "        subtotal: totals.subtotal,",
     "        discount: totals.discount,",
     "        shipping: totals.shipping,",
     "        total: totals.total,",
     "        promo_code: normalizedPromoCode || null,",
     "      })",
     "      .select(\"id\")",
     "      .single();",
     "    if (pendingErr) {",
     "      console.error(\"[checkout] échec création commande pending :\", pendingErr.message);",
     "      return res.status(500).json({ ok: false, error: \"Impossible de créer la commande pour le moment. Réessayez.\" });",
     "    }",
     "    pendingOrderId = pendingOrder.id;",
     "    const pendingItems = lines.map((l) => ({",
     "      order_id: pendingOrderId,",
     "      product_id: l.product.id,",
     "      product_name: l.product.name,",
     "      product_price: effectivePrice(l.product),",
     "      qty: l.qty,",
     "    }));",
     "    const { error: pendingItemsErr } = await supabaseAdmin.from(\"order_items\").insert(pendingItems);",
     "    if (pendingItemsErr) {",
     "      console.error(\"[checkout] échec création order_items (pending) :\", pendingItemsErr.message);",
     "      await supabaseAdmin.from(\"orders\").delete().eq(\"id\", pendingOrderId);",
     "      return res.status(500).json({ ok: false, error: \"Impossible de créer la commande pour le moment. Réessayez.\" });",
     "    }",
     "    const { error: reserveErr } = await supabaseAdmin.rpc(\"reserve_order_items\", {",
     "      p_order_id: pendingOrderId,",
     "      p_expires_at: new Date(Date.now() + RESERVATION_MINUTES * 60 * 1000).toISOString(),",
     "    });",
     "    if (reserveErr) {",
     "      await supabaseAdmin.from(\"orders\").delete().eq(\"id\", pendingOrderId);",
     "      const rawMessage = String(reserveErr.message || \"\");",
     "      const errorCode = rawMessage.split(\":\")[0].trim();",
     "      if (errorCode === \"PIECE_UNAVAILABLE\" || errorCode === \"STOCK_UNAVAILABLE\") {",
     "        const productIds = (rawMessage.split(\":\")[1] || \"\").split(\",\").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0);",
     "        return res.status(409).json({",
     "          ok: false,",
     "          error:",
     "            errorCode === \"PIECE_UNAVAILABLE\"",
     "              ? \"Une pièce unique de votre panier vient d'être réservée ou vendue. Retirez-la de votre panier pour continuer.\"",
     "              : \"Un article de votre panier n'est plus disponible en quantité suffisante. Retirez-le ou réduisez la quantité.\",",
     "          code: errorCode,",
     "          productIds,",
     "        });",
     "      }",
     "      console.error(\"[checkout] erreur non traduite de reserve_order_items :\", errorCode.slice(0, 80) || \"(sans code)\", reserveErr.code || \"\");",
     "      return res.status(500).json({ ok: false, error: \"Impossible de créer la commande pour le moment. Réessayez.\" });",
     "    }"
    ]
   },
   {
    "name": "K4 session Stripe : expires_at alignee sur la reservation (31 minutes)",
    "find": [
     "shipping_address_collection: { allowed_countries: [\"FR\"] },",
     "phone_number_collection: { enabled: true },"
    ],
    "replace": [
     "shipping_address_collection: { allowed_countries: [\"FR\"] },",
     "      phone_number_collection: { enabled: true },",
     "      expires_at: Math.floor(Date.now() / 1000) + RESERVATION_MINUTES * 60, // ZENORIA_STOCK_V1 : la session Stripe expire en meme temps que la reservation de stock/pieces"
    ]
   }
  ],
  "finals": [
   "reserve_order_items",
   "isUnique: row.is_unique",
   "RESERVATION_MINUTES",
   "ZENORIA_STOCK_V1",
   "expires_at: Math.floor(Date.now()"
  ],
  "forbidden": [
   "Math.min(10, Math.floor",
   "le webhook creera alors la commande complete en filet de securite"
  ]
 }
];

function fail(message) {
  console.error("\nECHEC : " + message);
  console.error("Aucun fichier n'a ete modifie.");
  process.exit(1);
}
if (!mode) fail("indiquez --dry-run ou --apply.");

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const toRegex = (lines) =>
  new RegExp(escapeRegex(lines.map((l) => l.trim()).join("\n")).replace(/\s+/g, "\\s+"), "g");

console.log("Mode : " + (mode === "apply" ? "APPLICATION" : "DRY-RUN (aucune ecriture)") + "\n");
const results = [];
const problems = [];

for (const f of FILES) {
  if (!fs.existsSync(f.path)) fail(f.path + " est introuvable. Lancez la commande depuis la racine du projet (dossier zenoria).");
  const original = fs.readFileSync(f.path, "utf8");
  const crlf = original.includes("\r\n");
  let content = original.replace(/\r\n/g, "\n");
  console.log(f.path + " (fins de ligne " + (crlf ? "Windows CRLF" : "Unix LF") + ")");
  if (content.includes(MARKER)) fail(f.path + " : le patch est deja applique (marqueur " + MARKER + " present).");
  const before = problems.length;
  for (const p of f.patches) {
    const count = (content.match(toRegex(p.find)) || []).length;
    console.log((count === 1 ? "  OK  " : " ERREUR ") + p.name + " : " + count + " occurrence(s)");
    if (count !== 1) problems.push(f.path + " : " + p.name + " (" + count + " occurrence(s) au lieu de 1)");
  }
  if (problems.length === before) for (const p of f.patches) content = content.replace(toRegex(p.find), () => p.replace.join("\n"));
  results.push({ f, content, crlf });
}
if (problems.length > 0) fail("verifier :\n  - " + problems.join("\n  - "));

for (const r of results) {
  for (const needle of r.f.finals) if (!r.content.includes(needle)) fail("controle final " + r.f.path + " : « " + needle + " » absent apres patch.");
  for (const bad of r.f.forbidden) if (r.content.includes(bad)) fail("controle final " + r.f.path + " : « " + bad + " » est toujours present apres patch.");
}
if (mode === "dry") {
  console.log("\nDRY-RUN termine : les " + FILES.length + " fichiers sont conformes. Rien n'a ete ecrit.");
  console.log("Etape suivante : node scripts/patch-lot2b-checkout.mjs --apply");
  process.exit(0);
}
for (const r of results) fs.writeFileSync(r.f.path, r.crlf ? r.content.replace(/\n/g, "\r\n") : r.content, "utf8");
console.log("\nPATCH APPLIQUE : " + results.length + " fichier(s) modifie(s).");
console.log("Etapes suivantes : git status --short, puis npm run build.");
console.log("Retour arriere avant commit : git restore pages/api/checkout.js");
