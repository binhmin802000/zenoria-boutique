// scripts/patch-webhook-pending-order.mjs
//
// Phase 2 du chantier paiement (suite) : adapte le webhook pour mettre a
// jour la commande "pending" deja creee par pages/api/checkout.js (voir
// patch-checkout-pending-order.mjs), au lieu d'en creer une nouvelle a
// chaque paiement reussi.
//
// Nouvelle logique :
//   - Si une commande existe deja pour ce stripe_session_id ET qu'elle
//     n'est PAS "pending" (deja "paid", etc.) : evenement Stripe renvoye
//     en double, on ne retraite pas (comportement deja existant).
//   - Si elle existe et est "pending" : on la MET A JOUR (statut paid,
//     coordonnees de livraison, date de paiement), SANS recreer les
//     order_items (deja inseres par checkout.js au moment du clic
//     "Commander").
//   - Si aucune commande n'existe pour ce stripe_session_id (ancien flux,
//     ou echec d'ecriture cote checkout.js) : on cree la commande complete
//     comme avant (filet de securite, pour ne jamais perdre une vente
//     confirmee par Stripe).
//
// Prerequis : patch-checkout-pending-order.mjs doit avoir ete applique
// (ou au minimum, orders.is_test doit deja exister).
//
// Garanties : verifie le repere exact (bloc complet) avant d'ecrire quoi
// que ce soit ; n'ecrit rien si le repere manque ou si c'est deja en
// place ; conserve les fins de ligne du fichier ; peut etre relance sans
// effet.
//
// Usage : node scripts/patch-webhook-pending-order.mjs

import fs from "node:fs";
import path from "node:path";

const filePath = path.join("pages", "api", "webhooks", "stripe.js");

if (!fs.existsSync(filePath)) {
  console.error(`✗ Fichier introuvable : ${filePath}`);
  console.error("Lancez cette commande depuis le dossier « zenoria ».");
  process.exit(1);
}

const raw = fs.readFileSync(filePath, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";

if (raw.includes("existingOrder.status !== \"pending\"")) {
  console.log("✓ Rien à modifier : la mise à jour des commandes pending est déjà en place.");
  process.exit(0);
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

const needle =
  "    const { data: existingOrder } = await supabaseAdmin" + eol +
  '      .from("orders")' + eol +
  '      .select("id")' + eol +
  '      .eq("stripe_session_id", session.id)' + eol +
  "      .maybeSingle();" + eol +
  eol +
  "    if (existingOrder) {" + eol +
  "      return res.status(200).json({ ok: true, already: true, orderId: existingOrder.id });" + eol +
  "    }" + eol +
  eol +
  "    const meta = session.metadata || {};" + eol +
  "    let cartItems = [];" + eol +
  "    try {" + eol +
  '      cartItems = JSON.parse(meta.cart_items || "[]");' + eol +
  "    } catch {" + eol +
  "      cartItems = [];" + eol +
  "    }" + eol +
  eol +
  "    const customer = session.customer_details || {};" + eol +
  "    const address = customer.address || {};" + eol +
  eol +
  "    const { data: orderRow, error: orderErr } = await supabaseAdmin" + eol +
  '      .from("orders")' + eol +
  "      .insert({" + eol +
  "        user_id: null, // aucun compte relié au paiement pour l'instant (viendra avec le branchement du panier)" + eol +
  "        guest_email: customer.email || null," + eol +
  '        status: "paid",' + eol +
  "        is_test: event.livemode === false," + eol +
  '        subtotal: Number(meta.subtotal || 0),' + eol +
  "        discount: Number(meta.discount || 0)," + eol +
  "        shipping: Number(meta.shipping || 0)," + eol +
  "        total: Number(meta.total || (session.amount_total || 0) / 100)," + eol +
  "        promo_code: meta.promo_code || null," + eol +
  "        stripe_session_id: session.id," + eol +
  "        stripe_payment_intent: session.payment_intent || null," + eol +
  "        shipping_full_name: customer.name || null," + eol +
  "        shipping_address_line1: address.line1 || null," + eol +
  "        shipping_address_line2: address.line2 || null," + eol +
  "        shipping_postal_code: address.postal_code || null," + eol +
  "        shipping_city: address.city || null," + eol +
  '        shipping_country: address.country || "France",' + eol +
  "        shipping_phone: customer.phone || null," + eol +
  "        paid_at: new Date().toISOString()," + eol +
  "      })" + eol +
  '      .select("id")' + eol +
  "      .single();" + eol +
  eol +
  "    if (orderErr) {" + eol +
  '      console.error("[webhook-stripe] échec insertion orders :", orderErr.message);' + eol +
  '      return res.status(500).json({ ok: false, error: "échec enregistrement commande" });' + eol +
  "    }" + eol +
  eol +
  "    if (cartItems.length > 0) {" + eol +
  "      const itemsToInsert = cartItems.map((it) => ({" + eol +
  "        order_id: orderRow.id," + eol +
  "        product_id: it.id ?? null," + eol +
  '        product_name: it.name || "Article",' + eol +
  "        product_price: Number(it.price || 0)," + eol +
  "        qty: Number(it.qty || 1)," + eol +
  "      }));" + eol +
  '      const { error: itemsErr } = await supabaseAdmin.from("order_items").insert(itemsToInsert);' + eol +
  "      if (itemsErr) {" + eol +
  '        console.error("[webhook-stripe] échec insertion order_items :", itemsErr.message);' + eol +
  "      }" + eol +
  "    }" + eol +
  eol +
  "    const { error: historyErr } = await supabaseAdmin" + eol +
  '      .from("order_status_history")' + eol +
  '      .insert({ order_id: orderRow.id, status: "paid", note: "Paiement confirmé par Stripe (webhook)" });' + eol +
  "    if (historyErr) {" + eol +
  '      console.error("[webhook-stripe] échec insertion order_status_history :", historyErr.message);' + eol +
  "    }" + eol +
  eol +
  "    return res.status(200).json({ ok: true, orderId: orderRow.id });";

const count = countOccurrences(raw, needle);
if (count !== 1) {
  console.error("✗ 1 repère à adapter — aucun fichier n'a été modifié.\n");
  console.error(`  • bloc complet de traitement de la commande attendu, ${count} correspondance(s) trouvée(s), 1 attendue`);
  console.error("\nVérifiez le contenu actuel de pages/api/webhooks/stripe.js et collez-moi les lignes concernées.");
  process.exit(1);
}

const replacement =
  "    const { data: existingOrder } = await supabaseAdmin" + eol +
  '      .from("orders")' + eol +
  '      .select("id, status")' + eol +
  '      .eq("stripe_session_id", session.id)' + eol +
  "      .maybeSingle();" + eol +
  eol +
  '    if (existingOrder && existingOrder.status !== "pending") {' + eol +
  "      // Déjà traitée (paid/shipped/...) : Stripe renvoie parfois le même" + eol +
  "      // événement plusieurs fois, on ne la retraite pas une seconde fois." + eol +
  "      return res.status(200).json({ ok: true, already: true, orderId: existingOrder.id });" + eol +
  "    }" + eol +
  eol +
  "    const meta = session.metadata || {};" + eol +
  "    let cartItems = [];" + eol +
  "    try {" + eol +
  '      cartItems = JSON.parse(meta.cart_items || "[]");' + eol +
  "    } catch {" + eol +
  "      cartItems = [];" + eol +
  "    }" + eol +
  eol +
  "    const customer = session.customer_details || {};" + eol +
  "    const address = customer.address || {};" + eol +
  eol +
  "    let orderId;" + eol +
  eol +
  "    if (existingOrder) {" + eol +
  '      // La commande existe déjà en "pending" (créée par pages/api/checkout.js' + eol +
  '      // dès le clic "Commander") : on la met à jour, sans recréer order_items' + eol +
  "      // (déjà insérés à ce moment-là)." + eol +
  "      const { data: updatedOrder, error: updateErr } = await supabaseAdmin" + eol +
  '        .from("orders")' + eol +
  "        .update({" + eol +
  '          status: "paid",' + eol +
  "          guest_email: customer.email || null," + eol +
  "          stripe_payment_intent: session.payment_intent || null," + eol +
  "          shipping_full_name: customer.name || null," + eol +
  "          shipping_address_line1: address.line1 || null," + eol +
  "          shipping_address_line2: address.line2 || null," + eol +
  "          shipping_postal_code: address.postal_code || null," + eol +
  "          shipping_city: address.city || null," + eol +
  '          shipping_country: address.country || "France",' + eol +
  "          shipping_phone: customer.phone || null," + eol +
  "          paid_at: new Date().toISOString()," + eol +
  "        })" + eol +
  '        .eq("id", existingOrder.id)' + eol +
  '        .select("id")' + eol +
  "        .single();" + eol +
  eol +
  "      if (updateErr) {" + eol +
  '        console.error("[webhook-stripe] échec mise à jour orders (pending → paid) :", updateErr.message);' + eol +
  '        return res.status(500).json({ ok: false, error: "échec mise à jour commande" });' + eol +
  "      }" + eol +
  "      orderId = updatedOrder.id;" + eol +
  "    } else {" + eol +
  '      // Filet de sécurité : aucune commande "pending" trouvée (ancien flux,' + eol +
  "      // ou échec d'écriture côté checkout.js) : on crée la commande complète" + eol +
  "      // comme avant, pour ne jamais perdre une vente confirmée par Stripe." + eol +
  "      const { data: orderRow, error: orderErr } = await supabaseAdmin" + eol +
  '        .from("orders")' + eol +
  "        .insert({" + eol +
  "          user_id: null," + eol +
  "          guest_email: customer.email || null," + eol +
  '          status: "paid",' + eol +
  "          is_test: event.livemode === false," + eol +
  "          subtotal: Number(meta.subtotal || 0)," + eol +
  "          discount: Number(meta.discount || 0)," + eol +
  "          shipping: Number(meta.shipping || 0)," + eol +
  "          total: Number(meta.total || (session.amount_total || 0) / 100)," + eol +
  "          promo_code: meta.promo_code || null," + eol +
  "          stripe_session_id: session.id," + eol +
  "          stripe_payment_intent: session.payment_intent || null," + eol +
  "          shipping_full_name: customer.name || null," + eol +
  "          shipping_address_line1: address.line1 || null," + eol +
  "          shipping_address_line2: address.line2 || null," + eol +
  "          shipping_postal_code: address.postal_code || null," + eol +
  "          shipping_city: address.city || null," + eol +
  '          shipping_country: address.country || "France",' + eol +
  "          shipping_phone: customer.phone || null," + eol +
  "          paid_at: new Date().toISOString()," + eol +
  "        })" + eol +
  '        .select("id")' + eol +
  "        .single();" + eol +
  eol +
  "      if (orderErr) {" + eol +
  '        console.error("[webhook-stripe] échec insertion orders :", orderErr.message);' + eol +
  '        return res.status(500).json({ ok: false, error: "échec enregistrement commande" });' + eol +
  "      }" + eol +
  "      orderId = orderRow.id;" + eol +
  eol +
  "      if (cartItems.length > 0) {" + eol +
  "        const itemsToInsert = cartItems.map((it) => ({" + eol +
  "          order_id: orderId," + eol +
  "          product_id: it.id ?? null," + eol +
  '          product_name: it.name || "Article",' + eol +
  "          product_price: Number(it.price || 0)," + eol +
  "          qty: Number(it.qty || 1)," + eol +
  "        }));" + eol +
  '        const { error: itemsErr } = await supabaseAdmin.from("order_items").insert(itemsToInsert);' + eol +
  "        if (itemsErr) {" + eol +
  '          console.error("[webhook-stripe] échec insertion order_items :", itemsErr.message);' + eol +
  "        }" + eol +
  "      }" + eol +
  "    }" + eol +
  eol +
  "    const { error: historyErr } = await supabaseAdmin" + eol +
  '      .from("order_status_history")' + eol +
  '      .insert({ order_id: orderId, status: "paid", note: "Paiement confirmé par Stripe (webhook)" });' + eol +
  "    if (historyErr) {" + eol +
  '      console.error("[webhook-stripe] échec insertion order_status_history :", historyErr.message);' + eol +
  "    }" + eol +
  eol +
  "    return res.status(200).json({ ok: true, orderId });";

const out = raw.replace(needle, replacement);
fs.writeFileSync(filePath, out, "utf8");

console.log(`✓ ${filePath} : mise à jour des commandes « pending » ajoutée`);
console.log("  • commande pending retrouvée par stripe_session_id, mise à jour (pending → paid)");
console.log("  • order_items non recréés si la commande existait déjà en pending");
console.log("  • filet de sécurité conservé : création complète si aucune commande pending trouvée");
console.log("\nTerminé.");
