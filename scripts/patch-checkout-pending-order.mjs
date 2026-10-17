// scripts/patch-checkout-pending-order.mjs
//
// Phase 2 du chantier paiement : cree la commande en base des le clic
// "Commander" (statut "pending"), AVANT la redirection vers Stripe. Le
// webhook (voir patch-webhook-pending-order.mjs) la fera ensuite passer a
// "paid" au lieu d'en creer une nouvelle. Objectif : voir enfin les
// paniers abandonnes avant paiement dans /admin > Commandes.
//
// CORRECTION (apres echec constate en test) : la table orders impose la
// contrainte "orders_user_or_guest" (user_id IS NOT NULL OR guest_email
// IS NOT NULL). A ce stade du parcours, Stripe n'a pas encore demande
// l'e-mail a la cliente (ca se passe sur la page Stripe, apres la
// redirection) : on insere donc un e-mail temporaire explicite
// ("en_attente@zenoria.local"), qui sera ECRASE par le vrai e-mail des que
// le webhook confirme le paiement (voir patch-webhook-pending-order.mjs).
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

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

const PENDING_GUEST_EMAIL = "en_attente@zenoria.local";

// ---------------------------------------------------------------------
// Idempotence : si le marqueur de la version CORRIGEE est déjà présent,
// rien à faire. Si l'ANCIENNE version (sans guest_email temporaire) est
// présente, on la détecte séparément pour la corriger proprement.
// ---------------------------------------------------------------------
const alreadyFixed = raw.includes(PENDING_GUEST_EMAIL);
const hasOldPendingBlock = raw.includes("pendingOrderId") && !alreadyFixed;

if (alreadyFixed) {
  console.log("✓ Rien à modifier : la création de commande « pending » (version corrigée) est déjà en place.");
  process.exit(0);
}

if (hasOldPendingBlock) {
  // Corrige uniquement la ligne fautive de l'ancienne version, sans tout reconstruire.
  const oldLine = '          guest_email: null,';
  const oldCount = countOccurrences(raw, oldLine);
  if (oldCount !== 1) {
    console.error(`✗ 1 repère à adapter — aucun fichier n'a été modifié.\n`);
    console.error(`  • ligne « guest_email: null, » (version non corrigée) attendue, ${oldCount} correspondance(s) trouvée(s), 1 attendue`);
    console.error("\nVérifiez le contenu actuel de pages/api/checkout.js et collez-moi les lignes concernées.");
    process.exit(1);
  }
  const newLine = `          guest_email: "${PENDING_GUEST_EMAIL}", // temporaire : remplace par le vrai e-mail une fois le webhook confirme`;
  const out = raw.replace(oldLine, newLine);
  fs.writeFileSync(filePath, out, "utf8");
  console.log(`✓ ${filePath} : correction appliquée (guest_email temporaire au lieu de null, respecte la contrainte orders_user_or_guest).`);
  console.log("\nTerminé.");
  process.exit(0);
}

// ---------------------------------------------------------------------
// Repères, pour une installation complète depuis zéro (fichier n'ayant
// jamais reçu aucune des deux versions du patch)
// ---------------------------------------------------------------------
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
  "    // guest_email temporaire : la contrainte orders_user_or_guest exige un" + eol +
  "    // user_id ou un guest_email non nul ; Stripe ne connait pas encore le" + eol +
  "    // vrai e-mail a ce stade (il sera demande sur sa propre page). Le webhook" + eol +
  "    // remplace cette valeur par le vrai e-mail des que le paiement est confirme." + eol +
  "    let pendingOrderId = null;" + eol +
  "    try {" + eol +
  "      const { data: pendingOrder, error: pendingErr } = await supabaseAdmin" + eol +
  '        .from("orders")' + eol +
  "        .insert({" + eol +
  "          user_id: null," + eol +
  `          guest_email: "${PENDING_GUEST_EMAIL}", // temporaire : remplace par le vrai e-mail une fois le webhook confirme` + eol +
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
console.log("  • guest_email temporaire (respecte la contrainte orders_user_or_guest)");
console.log("  • order_id transmis dans les métadonnées Stripe");
console.log("  • stripe_session_id lié à la commande pending après création de la session");
console.log("\nTerminé.");
