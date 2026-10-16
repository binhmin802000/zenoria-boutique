// scripts/create-stripe-checkout.mjs
//
// Chantier paiement (Stripe), etape 7 : cree DEUX NOUVEAUX fichiers.
//
//   1. lib/cartTotals.js
//      Logique de calcul du panier (SHIPPING_FEE, round2, effectivePrice,
//      computeTotals), copiee fidelement depuis pages/index.js, partagee
//      avec la route API ci-dessous. ATTENTION : si cette logique change un
//      jour dans pages/index.js (nouveau type de remise, nouvelle regle de
//      livraison...), ce fichier doit etre mis a jour EN MEME TEMPS, sinon
//      le prix affiche a la cliente et le prix facture par Stripe
//      pourraient diverger.
//
//   2. pages/api/checkout.js
//      Route API qui relit les vrais prix en base (jamais ceux envoyes par
//      le navigateur), recalcule le total avec lib/cartTotals.js, puis cree
//      une session Stripe Checkout avec ce montant verifie.
//
// CE SCRIPT NE MODIFIE PAS pages/index.js : la logique de calcul existante
// n'est pas touchee, pour ne prendre aucun risque sur le panier deja en
// production. lib/cartTotals.js en est une copie independante, documentee.
//
// Garanties : n'ecrit un fichier que s'il n'existe pas deja ; si un fichier
// existe deja mais ne contient PAS le marqueur attendu, le script s'arrete
// sans rien ecraser (pour ne jamais perdre une modification manuelle) ;
// peut etre relance sans effet une fois les deux fichiers en place.
//
// Usage : node scripts/create-stripe-checkout.mjs

import fs from "node:fs";
import path from "node:path";

const CART_TOTALS_CONTENT = [
  "// ZENORIA_CART_TOTALS_V1",
  "// ============================================================",
  "// lib/cartTotals.js",
  "//",
  "// Logique de calcul du panier, partagee entre le site (pages/index.js) et",
  "// les routes API (pages/api/checkout.js), pour que le montant affiche a",
  "// la cliente et le montant reellement facture par Stripe soient TOUJOURS",
  "// identiques.",
  "//",
  "// ATTENTION : ce fichier est une copie fidele de ce qui existe deja dans",
  "// pages/index.js (SHIPPING_FEE, round2, effectivePrice, computeTotals).",
  "// Si cette logique change un jour sur le site (nouveau type de remise,",
  "// nouvelle regle de livraison...), ce fichier doit etre mis a jour EN MEME",
  "// TEMPS, sinon le prix du panier et le prix facture pourraient diverger.",
  "// ============================================================",
  "",
  "import { DEFAULT_SHIPPING, qualifiesForFreeShipping } from \"./shippingSettings\";",
  "",
  "export const SHIPPING_FEE = 4.9; // frais de livraison sous le seuil (France)",
  "",
  "export const round2 = (n) => Math.round(n * 100) / 100;",
  "",
  "// Prix reellement applique : le prix promotionnel s'il est defini et inferieur au prix normal.",
  "export const effectivePrice = (p) => (p.promoPrice != null && p.promoPrice < p.price ? p.promoPrice : p.price);",
  "",
  "// Calcul des montants du panier (sous-total, remise, livraison, total)",
  "// -- copie exacte de la fonction du meme nom dans pages/index.js --",
  "export function computeTotals(lines, promo, shippingCfg = DEFAULT_SHIPPING) {",
  "  const subtotal = round2(lines.reduce((s, l) => s + effectivePrice(l.product) * l.qty, 0));",
  "  let discount = 0;",
  "  if (promo && promo.type === \"percent\") discount = round2((subtotal * promo.value) / 100);",
  "  if (promo && promo.type === \"fixed\") discount = Math.min(promo.value, subtotal);",
  "  const discounted = round2(subtotal - discount);",
  "  const freeByPromo = Boolean(promo && promo.type === \"shipping\");",
  "  const qualifies = qualifiesForFreeShipping(shippingCfg, discounted);",
  "  const shipping = lines.length === 0 ? 0 : freeByPromo || qualifies ? 0 : SHIPPING_FEE;",
  "  const total = round2(discounted + shipping);",
  "  const remaining = shippingCfg.enabled ? round2(Math.max(0, shippingCfg.threshold - discounted)) : 0;",
  "  return { subtotal, discount, shipping, total, remaining, freeShipping: lines.length > 0 && shipping === 0 };",
  "}",
].join("\r\n") + "\r\n";
const CHECKOUT_CONTENT = [
  "// ZENORIA_API_CHECKOUT_V1",
  "// ============================================================",
  "// pages/api/checkout.js \u2014 cree une session Stripe Checkout (mode test)",
  "//",
  "// SECURITE : les prix ne sont JAMAIS pris depuis la requete envoyee par le",
  "// navigateur. Ils sont relus depuis Supabase (table products), puis le",
  "// total est recalcule avec EXACTEMENT la meme logique que le site",
  "// (lib/cartTotals.js), pour que le montant facture corresponde toujours a",
  "// ce que la cliente a vu dans son panier.",
  "//",
  "// Entree attendue (POST, JSON) :",
  "//   { items: [{ id, qty }, ...], promoCode: \"CODE\" | null }",
  "//",
  "// Sortie :",
  "//   succes  -> { ok: true, url: \"https://checkout.stripe.com/...\" }",
  "//   erreur  -> { ok: false, error: \"...\" }",
  "// ============================================================",
  "",
  "import Stripe from \"stripe\";",
  "import { supabase } from \"@/lib/supabase\";",
  "import { SITE_SETTINGS_TABLE } from \"@/lib/siteSettings\";",
  "import { SHIPPING_KEY, DEFAULT_SHIPPING, parseShippingSetting } from \"@/lib/shippingSettings\";",
  "import { computeTotals, effectivePrice } from \"@/lib/cartTotals\";",
  "",
  "const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);",
  "",
  "export default async function handler(req, res) {",
  "  if (req.method !== \"POST\") {",
  "    res.setHeader(\"Allow\", \"POST\");",
  "    return res.status(405).json({ ok: false, error: \"m\u00e9thode non autoris\u00e9e\" });",
  "  }",
  "",
  "  if (!process.env.STRIPE_SECRET_KEY) {",
  "    return res.status(500).json({ ok: false, error: \"STRIPE_SECRET_KEY absente sur le serveur\" });",
  "  }",
  "",
  "  try {",
  "    const { items, promoCode } = req.body || {};",
  "",
  "    if (!Array.isArray(items) || items.length === 0) {",
  "      return res.status(400).json({ ok: false, error: \"panier vide\" });",
  "    }",
  "",
  "    // 1) Relit les vrais produits en base (jamais les prix envoyes par le navigateur)",
  "    const ids = items.map((it) => Number(it && it.id)).filter((id) => Number.isFinite(id));",
  "    if (ids.length === 0) {",
  "      return res.status(400).json({ ok: false, error: \"aucun identifiant de produit valide\" });",
  "    }",
  "",
  "    const { data: productsRows, error: prodErr } = await supabase",
  "      .from(\"products\")",
  "      .select(\"id, name, price, promo_price, stock, active\")",
  "      .in(\"id\", ids)",
  "      .eq(\"active\", true);",
  "",
  "    if (prodErr) {",
  "      return res.status(500).json({ ok: false, error: \"impossible de lire le catalogue\" });",
  "    }",
  "",
  "    const productById = new Map((productsRows || []).map((p) => [p.id, p]));",
  "",
  "    // 2) Reconstitue les lignes du panier a partir des DONNEES EN BASE,",
  "    //    jamais a partir de ce qu'a envoye le navigateur.",
  "    const lines = [];",
  "    for (const it of items) {",
  "      const row = productById.get(Number(it && it.id));",
  "      if (!row) continue; // produit inconnu, desactive ou supprime : ligne ignoree",
  "      const qty = Math.max(1, Math.min(10, Math.floor(Number(it.qty) || 1))); // meme plafond que le site",
  "      lines.push({",
  "        product: {",
  "          id: row.id,",
  "          name: row.name,",
  "          price: Number(row.price),",
  "          promoPrice:",
  "            row.promo_price !== null && row.promo_price !== undefined ? Number(row.promo_price) : null,",
  "        },",
  "        qty,",
  "      });",
  "    }",
  "",
  "    if (lines.length === 0) {",
  "      return res.status(400).json({ ok: false, error: \"aucun article valide dans le panier\" });",
  "    }",
  "",
  "    // 3) Relit le code promo en base (jamais ce qu'envoie le navigateur)",
  "    let promo = null;",
  "    let normalizedPromoCode = \"\";",
  "    if (promoCode && String(promoCode).trim()) {",
  "      normalizedPromoCode = String(promoCode).trim().toUpperCase();",
  "      const { data: promoRow } = await supabase",
  "        .from(\"promo_codes\")",
  "        .select(\"code, type, value, label, active\")",
  "        .eq(\"code\", normalizedPromoCode)",
  "        .eq(\"active\", true)",
  "        .maybeSingle();",
  "      if (promoRow) promo = { type: promoRow.type, value: Number(promoRow.value), label: promoRow.label };",
  "    }",
  "",
  "    // 4) Relit le reglage de livraison en base",
  "    const { data: settingsRows } = await supabase",
  "      .from(SITE_SETTINGS_TABLE)",
  "      .select(\"key, value\")",
  "      .in(\"key\", [SHIPPING_KEY]);",
  "    const shippingRow = (settingsRows || []).find((r) => r.key === SHIPPING_KEY);",
  "    const shippingCfg = parseShippingSetting(shippingRow ? shippingRow.value : null) || DEFAULT_SHIPPING;",
  "",
  "    // 5) Recalcule le total avec EXACTEMENT la meme logique que le site",
  "    const totals = computeTotals(lines, promo, shippingCfg);",
  "",
  "    // 6) Construit les lignes Stripe (prix en centimes, obligatoire pour Stripe)",
  "    const stripeLineItems = lines.map((l) => ({",
  "      price_data: {",
  "        currency: \"eur\",",
  "        product_data: { name: l.product.name },",
  "        unit_amount: Math.round(effectivePrice(l.product) * 100),",
  "      },",
  "      quantity: l.qty,",
  "    }));",
  "",
  "    if (totals.shipping > 0) {",
  "      stripeLineItems.push({",
  "        price_data: {",
  "          currency: \"eur\",",
  "          product_data: { name: \"Livraison (France)\" },",
  "          unit_amount: Math.round(totals.shipping * 100),",
  "        },",
  "        quantity: 1,",
  "      });",
  "    }",
  "",
  "    const origin = req.headers.origin || `https://${req.headers.host}`;",
  "",
  "    const sessionParams = {",
  "      mode: \"payment\",",
  "      payment_method_types: [\"card\"],",
  "      line_items: stripeLineItems,",
  "      success_url: `${origin}/?paiement=succes&session_id={CHECKOUT_SESSION_ID}`,",
  "      cancel_url: `${origin}/?paiement=annule`,",
  "      metadata: {",
  "        promo_code: normalizedPromoCode || \"\",",
  "      },",
  "    };",
  "",
  "    // La remise (totals.discount) est appliquee via un coupon Stripe cree a",
  "    // la volee, pour rester coherent avec les codes promo deja geres cote",
  "    // Zenoria (table promo_codes), plutot que d'utiliser le systeme de",
  "    // Promotion Codes propre a Stripe.",
  "    if (totals.discount > 0) {",
  "      const coupon = await stripe.coupons.create({",
  "        amount_off: Math.round(totals.discount * 100),",
  "        currency: \"eur\",",
  "        duration: \"once\",",
  "        name: promo ? promo.label : \"Remise\",",
  "      });",
  "      sessionParams.discounts = [{ coupon: coupon.id }];",
  "    }",
  "",
  "    const session = await stripe.checkout.sessions.create(sessionParams);",
  "",
  "    return res.status(200).json({ ok: true, url: session.url });",
  "  } catch (err) {",
  "    return res.status(500).json({ ok: false, error: \"erreur lors de la cr\u00e9ation du paiement\" });",
  "  }",
  "}",
].join("\r\n") + "\r\n";
const files = [
  {
    file: path.join("lib", "cartTotals.js"),
    marker: "// ZENORIA_CART_TOTALS_V1",
    content: CART_TOTALS_CONTENT,
  },
  {
    file: path.join("pages", "api", "checkout.js"),
    marker: "// ZENORIA_API_CHECKOUT_V1",
    content: CHECKOUT_CONTENT,
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
}
