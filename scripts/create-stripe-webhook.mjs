// scripts/create-stripe-webhook.mjs
//
// Chantier paiement (Stripe), etape 9 : cree DEUX NOUVEAUX fichiers.
//
//   1. lib/supabaseAdmin.js
//      Client Supabase avec la cle service_role (acces complet, sans les
//      regles RLS). A n'utiliser QUE depuis des routes serveur comme le
//      webhook ci-dessous, jamais depuis une page ou un composant.
//
//   2. pages/api/webhooks/stripe.js
//      Route qui recoit les evenements Stripe, verifie leur signature,
//      puis cree la commande (orders + order_items + order_status_history)
//      quand un paiement est confirme (checkout.session.completed).
//
// Prerequis : pages/api/checkout.js doit deja envoyer les metadata
// necessaires (cart_items, subtotal, discount, shipping, total) a Stripe.
// Si ce n'est pas encore fait, lancez d'abord :
//   node scripts/add-checkout-order-metadata.mjs
//
// Garanties : n'ecrit un fichier que s'il n'existe pas deja ; si un
// fichier existe deja mais ne contient PAS le marqueur attendu, le
// script s'arrete sans rien ecraser ; peut etre relance sans effet une
// fois les deux fichiers en place.
//
// Usage : node scripts/create-stripe-webhook.mjs

import fs from "node:fs";
import path from "node:path";

const SUPABASE_ADMIN_CONTENT = [
  "// ZENORIA_SUPABASE_ADMIN_V1",
  "// ============================================================",
  "// lib/supabaseAdmin.js",
  "//",
  "// Client Supabase avec la cle service_role : CONTOURNE TOUTES LES REGLES",
  "// DE SECURITE (RLS) du projet. A utiliser UNIQUEMENT depuis du code qui",
  "// s'execute cote serveur (routes pages/api/...), JAMAIS depuis une page",
  "// ou un composant charge par le navigateur.",
  "//",
  "// La cle est lue dans SUPABASE_SERVICE_ROLE_KEY, SANS le prefixe",
  "// NEXT_PUBLIC_ : ce prefixe est reserve aux variables que Next.js envoie",
  "// volontairement au navigateur. Son absence ici est volontaire et",
  "// protege cette cle de toute exposition accidentelle.",
  "// ============================================================",
  "",
  "import { createClient } from \"@supabase/supabase-js\";",
  "",
  "const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;",
  "const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;",
  "",
  "export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {",
  "  auth: { autoRefreshToken: false, persistSession: false },",
  "});",
].join("\r\n") + "\r\n";
const WEBHOOK_CONTENT = [
  "// ZENORIA_API_WEBHOOK_STRIPE_V1",
  "// ============================================================",
  "// pages/api/webhooks/stripe.js",
  "//",
  "// Recoit les evenements envoyes par Stripe (mode test). Ne traite que",
  "// \"checkout.session.completed\" : cree la commande dans orders et",
  "// order_items, puis une ligne dans order_status_history, en utilisant la",
  "// cle service_role (seule autorisee a ecrire dans ces tables).",
  "//",
  "// SECURITE : la signature de chaque requete est verifiee AVANT tout",
  "// traitement. Une requete dont la signature ne correspond pas est",
  "// rejetee : ca garantit qu'elle provient bien de Stripe, pas d'un tiers",
  "// qui tenterait de fabriquer une fausse confirmation de paiement.",
  "//",
  "// Next.js doit recevoir le corps BRUT (non transforme en JSON) pour que",
  "// la verification de signature fonctionne : d'ou bodyParser: false et la",
  "// lecture manuelle du flux ci-dessous.",
  "// ============================================================",
  "",
  "import Stripe from \"stripe\";",
  "import { supabaseAdmin } from \"@/lib/supabaseAdmin\";",
  "",
  "export const config = {",
  "  api: {",
  "    bodyParser: false,",
  "  },",
  "};",
  "",
  "const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);",
  "",
  "// Lit le corps brut d'une requete Node.js (IncomingMessage) en un seul Buffer.",
  "function readRawBody(req) {",
  "  return new Promise((resolve, reject) => {",
  "    const chunks = [];",
  "    req.on(\"data\", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));",
  "    req.on(\"end\", () => resolve(Buffer.concat(chunks)));",
  "    req.on(\"error\", reject);",
  "  });",
  "}",
  "",
  "export default async function handler(req, res) {",
  "  if (req.method !== \"POST\") {",
  "    res.setHeader(\"Allow\", \"POST\");",
  "    return res.status(405).json({ ok: false, error: \"m\u00e9thode non autoris\u00e9e\" });",
  "  }",
  "",
  "  if (!process.env.STRIPE_WEBHOOK_SECRET) {",
  "    console.error(\"[webhook-stripe] STRIPE_WEBHOOK_SECRET absente sur le serveur\");",
  "    return res.status(500).json({ ok: false, error: \"configuration manquante\" });",
  "  }",
  "",
  "  const signature = req.headers[\"stripe-signature\"];",
  "  const rawBody = await readRawBody(req);",
  "",
  "  let event;",
  "  try {",
  "    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);",
  "  } catch (err) {",
  "    console.error(\"[webhook-stripe] signature invalide :\", err.message);",
  "    return res.status(400).json({ ok: false, error: \"signature invalide\" });",
  "  }",
  "",
  "  // On r\u00e9pond vite et on ignore tout \u00e9v\u00e9nement qu'on n'a pas demand\u00e9 \u00e0",
  "  // recevoir (seul \"checkout.session.completed\" a \u00e9t\u00e9 s\u00e9lectionn\u00e9 c\u00f4t\u00e9",
  "  // Stripe, mais ce garde-fou reste utile si d'autres \u00e9v\u00e9nements sont",
  "  // ajout\u00e9s un jour sans modifier ce fichier).",
  "  if (event.type !== \"checkout.session.completed\") {",
  "    return res.status(200).json({ ok: true, ignored: event.type });",
  "  }",
  "",
  "  const session = event.data.object;",
  "",
  "  try {",
  "    // \u00c9vite de cr\u00e9er deux fois la m\u00eame commande si Stripe renvoie le m\u00eame",
  "    // \u00e9v\u00e9nement plusieurs fois (il r\u00e9essaie automatiquement en cas de",
  "    // non-r\u00e9ponse ou d'erreur de notre part).",
  "    const { data: existingOrder } = await supabaseAdmin",
  "      .from(\"orders\")",
  "      .select(\"id\")",
  "      .eq(\"stripe_session_id\", session.id)",
  "      .maybeSingle();",
  "",
  "    if (existingOrder) {",
  "      return res.status(200).json({ ok: true, already: true, orderId: existingOrder.id });",
  "    }",
  "",
  "    const meta = session.metadata || {};",
  "    let cartItems = [];",
  "    try {",
  "      cartItems = JSON.parse(meta.cart_items || \"[]\");",
  "    } catch {",
  "      cartItems = [];",
  "    }",
  "",
  "    const customer = session.customer_details || {};",
  "    const address = customer.address || {};",
  "",
  "    const { data: orderRow, error: orderErr } = await supabaseAdmin",
  "      .from(\"orders\")",
  "      .insert({",
  "        user_id: null, // aucun compte reli\u00e9 au paiement pour l'instant (viendra avec le branchement du panier)",
  "        guest_email: customer.email || null,",
  "        status: \"paid\",",
  "        subtotal: Number(meta.subtotal || 0),",
  "        discount: Number(meta.discount || 0),",
  "        shipping: Number(meta.shipping || 0),",
  "        total: Number(meta.total || (session.amount_total || 0) / 100),",
  "        promo_code: meta.promo_code || null,",
  "        stripe_session_id: session.id,",
  "        stripe_payment_intent: session.payment_intent || null,",
  "        shipping_full_name: customer.name || null,",
  "        shipping_address_line1: address.line1 || null,",
  "        shipping_address_line2: address.line2 || null,",
  "        shipping_postal_code: address.postal_code || null,",
  "        shipping_city: address.city || null,",
  "        shipping_country: address.country || \"France\",",
  "        shipping_phone: customer.phone || null,",
  "        paid_at: new Date().toISOString(),",
  "      })",
  "      .select(\"id\")",
  "      .single();",
  "",
  "    if (orderErr) {",
  "      console.error(\"[webhook-stripe] \u00e9chec insertion orders :\", orderErr.message);",
  "      return res.status(500).json({ ok: false, error: \"\u00e9chec enregistrement commande\" });",
  "    }",
  "",
  "    if (cartItems.length > 0) {",
  "      const itemsToInsert = cartItems.map((it) => ({",
  "        order_id: orderRow.id,",
  "        product_id: it.id ?? null,",
  "        product_name: it.name || \"Article\",",
  "        product_price: Number(it.price || 0),",
  "        qty: Number(it.qty || 1),",
  "      }));",
  "      const { error: itemsErr } = await supabaseAdmin.from(\"order_items\").insert(itemsToInsert);",
  "      if (itemsErr) {",
  "        console.error(\"[webhook-stripe] \u00e9chec insertion order_items :\", itemsErr.message);",
  "      }",
  "    }",
  "",
  "    const { error: historyErr } = await supabaseAdmin",
  "      .from(\"order_status_history\")",
  "      .insert({ order_id: orderRow.id, status: \"paid\", note: \"Paiement confirm\u00e9 par Stripe (webhook)\" });",
  "    if (historyErr) {",
  "      console.error(\"[webhook-stripe] \u00e9chec insertion order_status_history :\", historyErr.message);",
  "    }",
  "",
  "    return res.status(200).json({ ok: true, orderId: orderRow.id });",
  "  } catch (err) {",
  "    console.error(\"[webhook-stripe] erreur inattendue :\", err && err.message ? err.message : err);",
  "    return res.status(500).json({ ok: false, error: \"erreur serveur\" });",
  "  }",
  "}",
].join("\r\n") + "\r\n";
const files = [
  {
    file: path.join("lib", "supabaseAdmin.js"),
    marker: "// ZENORIA_SUPABASE_ADMIN_V1",
    content: SUPABASE_ADMIN_CONTENT,
  },
  {
    file: path.join("pages", "api", "webhooks", "stripe.js"),
    marker: "// ZENORIA_API_WEBHOOK_STRIPE_V1",
    content: WEBHOOK_CONTENT,
  },
];

const blocked = [];
for (const f of files) {
  if (fs.existsSync(f.file)) {
    const existing = fs.readFileSync(f.file, "utf8");
    if (!existing.includes(f.marker)) {
      blocked.push(f.file);
    }
  }
}

if (blocked.length > 0) {
  console.error(`✗ ${blocked.length} fichier(s) existent déjà avec un contenu différent — rien n'a été écrit.\n`);
  for (const p of blocked) console.error(`  • ${p}`);
  console.error("\nSupprimez-les ou renommez-les si vous voulez les remplacer, puis relancez ce script.");
  process.exit(1);
}

let written = 0;
for (const f of files) {
  if (fs.existsSync(f.file) && fs.readFileSync(f.file, "utf8").includes(f.marker)) {
    console.log(`= ${f.file} : déjà en place, inchangé.`);
    continue;
  }
  fs.mkdirSync(path.dirname(f.file), { recursive: true });
  fs.writeFileSync(f.file, f.content, "utf8");
  console.log(`✓ ${f.file} : créé.`);
  written++;
}

if (written === 0) {
  console.log("\nRien à faire : les deux fichiers étaient déjà en place.");
} else {
  console.log("\nTerminé.");
  console.log("\nRappel : vérifiez que pages/api/checkout.js envoie bien les métadonnées");
  console.log("(cart_items, subtotal, discount, shipping, total) via");
  console.log("node scripts/add-checkout-order-metadata.mjs, sinon order_items restera vide.");
}
