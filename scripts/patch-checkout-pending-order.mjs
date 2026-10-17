// scripts/patch-checkout-pending-order.mjs
//
// Phase 2 du chantier paiement : cree la commande en base des le clic
// "Commander" (statut "pending"), AVANT la redirection vers Stripe. Le
// webhook (voir patch-webhook-pending-order.mjs) la fera ensuite passer a
// "paid" au lieu d'en creer une nouvelle. Objectif : voir enfin les
// paniers abandonnes avant paiement dans /admin > Commandes.
//
// Ce script modifie pages/api/checkout.js :
//   1. Importe supabaseAdmin (seule cle autorisee a ecrire dans orders).
//   2. Juste apres le calcul des totaux (etape 5), cree la commande en
//      "pending" + ses order_items, a partir des memes lignes deja
//      recalculees cote serveur (jamais les prix envoyes par le
//      navigateur). Non bloquant : si cette ecriture echoue, le paiement
//      continue normalement (ancien comportement), le webhook creera
//      alors la commande complete en filet de securite.
//   3. Ajoute order_id dans les metadata de la session Stripe, pour que
//      le webhook puisse retrouver et mettre a jour cette commande.
//   4. Juste apres la creation de la session Stripe, met a jour la
//      commande pending avec le vrai stripe_session_id.
//
// Garanties : verifie TOUS les reperes avant d'ecrire quoi que ce soit ;
// n'ecrit rien si un seul manque ; liste tous les reperes manquants ;
// conserve les fins de ligne du fichier ; peut etre relance sans effet.
//
// Usage : node scripts/patch-checkout-pending-order.mjs

import fs from "node:fs";
import path from "node:path";

const filePath = path.join("pages", "api", "checkout.js");

if (!fs.existsSync(filePath)) {
  console.error(`✗ Fichier introuvable : ${filePath}`);
  console.error("Lancez cette commande depuis le dossier « zenoria ».");
  process.exit(1);
}

const raw = fs.readFileSync(filePath, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";

if (raw.includes("pendingOrderId")) {
  console.log("✓ Rien à modifier : la création de commande « pending » est déjà en place.");
  process.exit(0);
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

const anchors = {};

anchors.supabaseImport = 'import { supabase } from "@/lib/supabase";';

anchors.totalsToLineItems =
  "    // 5) Recalcule le total avec EXACTEMENT la meme logique que le site" + eol +
  "    const totals = computeTotals(lines, promo, shippingCfg);" + eol +
  eol +
  "    // 6) Construit les lignes Stripe (prix en centimes, obligatoire pour Stripe)";

anchors.metadataBlock =
  "      metadata: {" + eol +
  '        promo_code: normalizedPromoCode || "",' + eol +
  "        cart_items: JSON.stringify(" + eol +
  "          lines.map((l) => ({ id: l.product.id, name: l.product.name, price: effectivePrice(l.product), qty: l.qty }))" + eol +
  "        )," + eol +
  "        subtotal: String(totals.subtotal)," + eol +
  "        discount: String(totals.discount)," + eol +
  "        shipping: String(totals.shipping)," + eol +
  "        total: String(totals.total)," + eol +
  "      },";

anchors.sessionToReturn =
  "    const session = await stripe.checkout.sessions.create(sessionParams);" + eol +
  eol +
  "    return res.status(200).json({ ok: true, url: session.url });";

const missing = [];
for (const [key, needle] of Object.entries(anchors)) {
  const count = countOccurrences(raw, needle);
  if (count !== 1) missing.push({ key, count });
}

if (missing.length > 0) {
  console.error(`✗ ${missing.length} repère(s) à adapter — aucun fichier n'a été modifié.\n`);
  for (const m of missing) {
    console.error(`  • repère « ${m.key} » (${m.count} correspondance(s) trouvée(s), 1 attendue)`);
  }
  console.error("\nVérifiez le contenu actuel de pages/api/checkout.js et collez-moi les lignes concernées.");
  process.exit(1);
}

let out = raw;

// 1) Import supabaseAdmin, juste après l'import supabase existant
out = out.replace(
  anchors.supabaseImport,
  anchors.supabaseImport + eol + 'import { supabaseAdmin } from "@/lib/supabaseAdmin";'
);

// 2) Création de la commande pending + order_items, juste après le calcul des totaux
const pendingCreationBlock =
  "    // 5) Recalcule le total avec EXACTEMENT la meme logique que le site" + eol +
  "    const totals = computeTotals(lines, promo, shippingCfg);" + eol +
  eol +
  "    // 5bis) Cree la commande en \"pending\" des maintenant, avant meme la" + eol +
  "    // redirection vers Stripe : les paniers abandonnes restent ainsi visibles" + eol +
  "    // dans /admin > Commandes. Le webhook la fera passer a \"paid\" une fois le" + eol +
  "    // paiement confirme, au lieu d'en creer une nouvelle. Non bloquant : si" + eol +
  "    // cette ecriture echoue, le paiement continue normalement (le webhook" + eol +
  "    // creera alors la commande complete en filet de securite, comme avant)." + eol +
  "    let pendingOrderId = null;" + eol +
  "    try {" + eol +
  "      const { data: pendingOrder, error: pendingErr } = await supabaseAdmin" + eol +
  '        .from("orders")' + eol +
  "        .insert({" + eol +
  "          user_id: null," + eol +
  "          guest_email: null," + eol +
  '          status: "pending",' + eol +
  '          is_test: !String(process.env.STRIPE_SECRET_KEY || "").startsWith("sk_live_"),' + eol +
  "          subtotal: totals.subtotal," + eol +
  "          discount: totals.discount," + eol +
  "          shipping: totals.shipping," + eol +
  "          total: totals.total," + eol +
  "          promo_code: normalizedPromoCode || null," + eol +
  "        })" + eol +
  '        .select("id")' + eol +
  "        .single();" + eol +
  "      if (pendingErr) {" + eol +
  '        console.error("[checkout] échec création commande pending :", pendingErr.message);' + eol +
  "      } else {" + eol +
  "        pendingOrderId = pendingOrder.id;" + eol +
  "        const pendingItems = lines.map((l) => ({" + eol +
  "          order_id: pendingOrderId," + eol +
  "          product_id: l.product.id," + eol +
  "          product_name: l.product.name," + eol +
  "          product_price: effectivePrice(l.product)," + eol +
  "          qty: l.qty," + eol +
  "        }));" + eol +
  '        const { error: pendingItemsErr } = await supabaseAdmin.from("order_items").insert(pendingItems);' + eol +
  "        if (pendingItemsErr) {" + eol +
  '          console.error("[checkout] échec création order_items (pending) :", pendingItemsErr.message);' + eol +
  "        }" + eol +
  "      }" + eol +
  "    } catch (e) {" + eol +
  '      console.error("[checkout] erreur inattendue (commande pending) :", e && e.message ? e.message : e);' + eol +
  "    }" + eol +
  eol +
  "    // 6) Construit les lignes Stripe (prix en centimes, obligatoire pour Stripe)";

out = out.replace(anchors.totalsToLineItems, pendingCreationBlock);

// 3) Ajoute order_id dans les métadonnées
const newMetadataBlock =
  "      metadata: {" + eol +
  '        promo_code: normalizedPromoCode || "",' + eol +
  '        order_id: pendingOrderId ? String(pendingOrderId) : "",' + eol +
  "        cart_items: JSON.stringify(" + eol +
  "          lines.map((l) => ({ id: l.product.id, name: l.product.name, price: effectivePrice(l.product), qty: l.qty }))" + eol +
  "        )," + eol +
  "        subtotal: String(totals.subtotal)," + eol +
  "        discount: String(totals.discount)," + eol +
  "        shipping: String(totals.shipping)," + eol +
  "        total: String(totals.total)," + eol +
  "      },";

out = out.replace(anchors.metadataBlock, newMetadataBlock);

// 4) Lie stripe_session_id à la commande pending, juste après la création de session
const newSessionToReturn =
  "    const session = await stripe.checkout.sessions.create(sessionParams);" + eol +
  eol +
  "    if (pendingOrderId) {" + eol +
  "      const { error: linkErr } = await supabaseAdmin" + eol +
  '        .from("orders")' + eol +
  "        .update({ stripe_session_id: session.id })" + eol +
  '        .eq("id", pendingOrderId);' + eol +
  "      if (linkErr) {" + eol +
  '        console.error("[checkout] échec liaison stripe_session_id :", linkErr.message);' + eol +
  "      }" + eol +
  "    }" + eol +
  eol +
  "    return res.status(200).json({ ok: true, url: session.url });";

out = out.replace(anchors.sessionToReturn, newSessionToReturn);

fs.writeFileSync(filePath, out, "utf8");

console.log(`✓ ${filePath} : création de commande « pending » ajoutée`);
console.log("  • import supabaseAdmin");
console.log("  • commande + order_items créés en « pending » dès le calcul des totaux");
console.log("  • order_id transmis dans les métadonnées Stripe");
console.log("  • stripe_session_id lié à la commande pending après création de la session");
console.log("\nTerminé.");
