#!/usr/bin/env node
// ============================================================
// PATCH ETAPE 1 : regle unique de la livraison offerte (seuil compare au panier AVANT code promo)
// Fichiers modifies (aucun autre, aucune base de donnees) :
//   lib/cartTotals.js         remplace : la regle, ecrite une seule fois (+ filet MIN_CHARGE de 0,50 EUR)
//   lib/shippingSettings.js   commentaires et nom d'un parametre (aucun changement de comportement)
//   pages/index.js            copie locale du calcul supprimee, import depuis lib/cartTotals, barre de progression alignee
//   components/AdminShipping.js   textes de l'admin
// Non modifies : pages/api/checkout.js et pages/api/checkout-transfer.js (ils appellent deja computeTotals de lib).
//
// Usage, depuis la racine du projet (dossier zenoria) :
//   node scripts/patch-etape1-livraison.mjs --dry-run   -> controle chaque ancre, n'ecrit RIEN
//   node scripts/patch-etape1-livraison.mjs --apply     -> ecrit les 4 fichiers si TOUT est conforme
// Garde-fous : rien n'est ecrit si une ancre est absente ou en double, ou si le patch est deja applique.
// ============================================================
import fs from "node:fs";

const MARKER = "ZENORIA_SHIPPING_RULE_V1";
const mode = process.argv.includes("--apply") ? "apply" : process.argv.includes("--dry-run") ? "dry" : null;
const FILES = [
 {
  "path": "lib/cartTotals.js",
  "kind": "replace",
  "mustContain": [
   "ZENORIA_CART_TOTALS_V1",
   "const freeByPromo = Boolean(promo && promo.type === \"shipping\");",
   "export function computeTotals",
   "export const SHIPPING_FEE"
  ],
  "content": "// ZENORIA_CART_TOTALS_V1\n// ZENORIA_SHIPPING_RULE_V1\n// ============================================================\n// lib/cartTotals.js\n//\n// Calcul du panier : SOURCE UNIQUE, partagee par le site (pages/index.js) et par les routes de paiement\n// (pages/api/checkout.js pour la carte, pages/api/checkout-transfer.js pour le virement).\n// Le montant affiche a la cliente et le montant facture sont donc TOUJOURS identiques.\n// Ne JAMAIS recopier ce calcul dans une page : l'importer.\n//\n// REGLE DE LA LIVRAISON OFFERTE (unique : panier, barre de progression, carte, virement)\n//   S = montant du panier = somme des (prix effectif x quantite), AVANT tout code promo.\n//   - livraison offerte activee (reglage admin) ET S >= seuil (reglage admin) : livraison offerte ;\n//   - sinon : frais de livraison (SHIPPING_FEE).\n//   Un code promo se deduit de S pour le montant a payer ; il ne change JAMAIS le droit a la livraison offerte.\n//   Un code dont le type est \"shipping\" n'a donc plus d'effet : sa remise est nulle.\n//   A payer = S - remise + livraison.\n//   « Plus que X EUR » et la barre de progression = seuil - S (jamais negatif), seulement si la livraison offerte est activee.\n// Filet de securite : si le montant apres remise est inferieur a MIN_CHARGE (Stripe refuse moins de 0,50 EUR),\n//   la livraison est facturee meme si le seuil est atteint.\n// ============================================================\nimport { DEFAULT_SHIPPING, qualifiesForFreeShipping } from \"./shippingSettings\";\nexport const SHIPPING_FEE = 4.9; // frais de livraison sous le seuil (France) : reste regle dans le code, pas dans l'admin\nexport const MIN_CHARGE = 0.5; // montant minimal facturable par Stripe (EUR)\nexport const round2 = (n) => Math.round(n * 100) / 100;\n// Prix reellement applique : le prix promotionnel s'il est defini et inferieur au prix normal.\nexport const effectivePrice = (p) => (p.promoPrice != null && p.promoPrice < p.price ? p.promoPrice : p.price);\n// Calcul des montants du panier (sous-total, remise, livraison, total, reste a atteindre)\nexport function computeTotals(lines, promo, shippingCfg = DEFAULT_SHIPPING) {\n  const subtotal = round2(lines.reduce((s, l) => s + effectivePrice(l.product) * l.qty, 0));\n  let discount = 0;\n  if (promo && promo.type === \"percent\") discount = round2((subtotal * promo.value) / 100);\n  if (promo && promo.type === \"fixed\") discount = Math.min(promo.value, subtotal);\n  const discounted = round2(subtotal - discount);\n  let shipping = 0;\n  if (lines.length > 0) {\n    // le seuil se compare au montant du panier AVANT code promo ; le filet MIN_CHARGE evite un paiement inferieur a 0,50 EUR\n    const free = qualifiesForFreeShipping(shippingCfg, subtotal) && discounted >= MIN_CHARGE;\n    shipping = free ? 0 : SHIPPING_FEE;\n  }\n  const total = round2(discounted + shipping);\n  const remaining = shippingCfg.enabled ? round2(Math.max(0, shippingCfg.threshold - subtotal)) : 0;\n  return { subtotal, discount, shipping, total, remaining, freeShipping: lines.length > 0 && shipping === 0 };\n}\n",
  "finals": [
   "export const MIN_CHARGE",
   "qualifiesForFreeShipping(shippingCfg, subtotal)"
  ],
  "forbidden": [
   "freeByPromo"
  ]
 },
 {
  "path": "lib/shippingSettings.js",
  "kind": "anchors",
  "patches": [
   {
    "name": "S1 en-tete : le seuil se compare au panier avant code promo",
    "find": [
     "//   threshold : montant en euros, entier de 1 à 1 000, comparé au panier APRÈS remise (>=)"
    ],
    "replace": [
     "//   threshold : montant en euros, entier de 1 à 1 000, comparé au montant du panier AVANT code promo (>=)  // ZENORIA_SHIPPING_RULE_V1"
    ]
   },
   {
    "name": "S2 en-tete : les codes promo ne changent pas le droit a la livraison offerte",
    "find": [
     "//   - les codes promo ne changent pas : un code de type « Livraison offerte » met toujours la livraison à 0 €."
    ],
    "replace": [
     "//   - les codes promo ne changent pas le droit à la livraison offerte : ils se déduisent du montant du panier."
    ]
   },
   {
    "name": "S3 regle unique (commentaire et nom du parametre, sans changement de comportement)",
    "find": [
     "// Règle unique : la livraison est offerte par le seuil quand elle est activée et que le panier (après remise) l§APOS§atteint.",
     "// (Le code promo « Livraison offerte » est traité à part, dans le calcul du panier.)",
     "export function qualifiesForFreeShipping(setting, amountAfterDiscount) {",
     "const s = parseShippingSetting(setting);",
     "return s.enabled && Number(amountAfterDiscount) >= s.threshold;",
     "}"
    ],
    "replace": [
     "// Règle unique : la livraison est offerte quand elle est activée et que le montant du panier, AVANT code promo, atteint le seuil.",
     "// (Le calcul complet est dans lib/cartTotals.js ; un code promo ne change jamais ce droit.)",
     "export function qualifiesForFreeShipping(setting, cartAmount) {",
     "  const s = parseShippingSetting(setting);",
     "  return s.enabled && Number(cartAmount) >= s.threshold;",
     "}"
    ]
   }
  ],
  "finals": [
   "AVANT code promo",
   "cartAmount"
  ],
  "forbidden": [
   "amountAfterDiscount",
   "APRÈS remise"
  ]
 },
 {
  "path": "components/AdminShipping.js",
  "kind": "anchors",
  "patches": [
   {
    "name": "A1 commentaire d'en-tete (repere du lot)",
    "find": [
     "// Tant que rien n§APOS§est enregistré, le site utilise la valeur par défaut (activée, 75 €). Voir supabase_shipping.sql."
    ],
    "replace": [
     "// Tant que rien n'est enregistré, le site utilise la valeur par défaut (activée, 75 €). Voir supabase_shipping.sql.",
     "// ZENORIA_SHIPPING_RULE_V1 : le montant se compare au panier AVANT code promo ; les codes promo ne changent pas ce droit."
    ]
   },
   {
    "name": "A2 aide du champ montant",
    "find": [
     "Comparé au panier après remise : le montant exact est atteint, la livraison est offerte."
    ],
    "replace": [
     "Comparé au montant du panier avant code promo : dès que ce montant est atteint, la livraison est offerte."
    ]
   },
   {
    "name": "A3 exemples de l'apercu",
    "find": [
     "(après remise) : livraison"
    ],
    "replace": [
     "(avant code promo) : livraison"
    ]
   },
   {
    "name": "A4 phrase sur les codes promo",
    "find": [
     "Un code promo « Livraison offerte » (comme LIVRAISONZEN) met toujours la livraison à 0 €, que l§APOS§interrupteur soit activé ou non. Les codes promo se gèrent séparément."
    ],
    "replace": [
     "Un code promo se déduit du montant du panier mais ne change jamais le droit à la livraison offerte : seul le montant du panier, avant code promo, compte. Les codes promo se gèrent séparément."
    ]
   },
   {
    "name": "A5 note finale devenue fausse",
    "find": [
     "Tant que le paiement en ligne n§APOS§est pas actif, le calcul se fait dans la page ; à l§APOS§ouverture du paiement, il devra être refait côté serveur avec ce même réglage."
    ],
    "replace": [
     "Le calcul de la livraison suit une règle unique, partagée par le site, le paiement par carte et le paiement par virement."
    ]
   }
  ],
  "finals": [
   "ZENORIA_SHIPPING_RULE_V1",
   "avant code promo"
  ],
  "forbidden": [
   "après remise",
   "comme LIVRAISONZEN",
   "devra être refait côté serveur"
  ]
 },
 {
  "path": "pages/index.js",
  "kind": "anchors",
  "patches": [
   {
    "name": "I1 imports : calcul du panier depuis lib/cartTotals",
    "find": [
     "import { SHIPPING_KEY, DEFAULT_SHIPPING, parseShippingSetting, qualifiesForFreeShipping, shippingStripText } from \"@/lib/shippingSettings\";"
    ],
    "replace": [
     "import { SHIPPING_KEY, DEFAULT_SHIPPING, parseShippingSetting, shippingStripText } from \"@/lib/shippingSettings\";",
     "import { round2, effectivePrice, computeTotals } from \"@/lib/cartTotals\"; // ZENORIA_SHIPPING_RULE_V1 : calcul du panier = source unique"
    ]
   },
   {
    "name": "I2 constante SHIPPING_FEE en double",
    "find": [
     "const SHIPPING_FEE = 4.9; // frais de livraison sous le seuil (France)"
    ],
    "replace": [
     "// ZENORIA_SHIPPING_RULE_V1 : les frais de livraison, les arrondis, le prix effectif et le calcul du panier viennent de lib/cartTotals.js"
    ]
   },
   {
    "name": "I3 round2 et effectivePrice en double",
    "find": [
     "const round2 = (n) => Math.round(n * 100) / 100;",
     "// Prix réellement appliqué : le prix promotionnel s§APOS§il est défini et inférieur au prix normal.",
     "const effectivePrice = (p) => (p.promoPrice != null && p.promoPrice < p.price ? p.promoPrice : p.price);"
    ],
    "replace": [
     "// (round2 et effectivePrice : voir lib/cartTotals.js)"
    ]
   },
   {
    "name": "I4 copie locale de computeTotals",
    "find": [
     "// Calcul des montants du panier (sous-total, remise, livraison, total)",
     "function computeTotals(lines, promo, shippingCfg = DEFAULT_SHIPPING) {",
     "const subtotal = round2(lines.reduce((s, l) => s + effectivePrice(l.product) * l.qty, 0));",
     "let discount = 0;",
     "if (promo && promo.type === \"percent\") discount = round2((subtotal * promo.value) / 100);",
     "if (promo && promo.type === \"fixed\") discount = Math.min(promo.value, subtotal);",
     "const discounted = round2(subtotal - discount);",
     "const freeByPromo = Boolean(promo && promo.type === \"shipping\");",
     "const qualifies = qualifiesForFreeShipping(shippingCfg, discounted);",
     "const shipping = lines.length === 0 ? 0 : freeByPromo || qualifies ? 0 : SHIPPING_FEE;",
     "const total = round2(discounted + shipping);",
     "const remaining = shippingCfg.enabled ? round2(Math.max(0, shippingCfg.threshold - discounted)) : 0;",
     "return { subtotal, discount, shipping, total, remaining, freeShipping: lines.length > 0 && shipping === 0 };",
     "}"
    ],
    "replace": [
     "// Calcul des montants du panier : computeTotals vient de lib/cartTotals.js (règle unique de la livraison offerte)."
    ]
   },
   {
    "name": "I5 pourcentage de la barre de progression",
    "find": [
     "const progress = Math.min(100, Math.round(((totals.subtotal - totals.discount) / shippingCfg.threshold) * 100));"
    ],
    "replace": [
     "const progress = Math.min(100, Math.round((totals.subtotal / shippingCfg.threshold) * 100)); // ZENORIA_SHIPPING_RULE_V1 : montant du panier avant code promo"
    ]
   }
  ],
  "finals": [
   "from \"@/lib/cartTotals\"",
   "totals.subtotal / shippingCfg.threshold"
  ],
  "forbidden": [
   "function computeTotals",
   "freeByPromo",
   "SHIPPING_FEE",
   "qualifiesForFreeShipping",
   "totals.subtotal - totals.discount"
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
// Les lignes d'une ancre sont comparees sans tenir compte des espaces/fins de ligne ; §APOS§ accepte ' ou &apos; ou l'apostrophe typographique.
const toRegex = (lines) =>
  new RegExp(escapeRegex(lines.map((l) => l.trim()).join("\n")).replace(/\s+/g, "\\s+").split("§APOS§").join("(?:&apos;|'|\u2019)"), "g");

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

  if (f.kind === "replace") {
    for (const needle of f.mustContain) {
      const ok = content.includes(needle);
      console.log((ok ? "  OK  " : " ERREUR ") + "contenu attendu : " + needle.slice(0, 70));
      if (!ok) problems.push(f.path + " : contenu attendu absent : " + needle);
    }
    content = f.content;
  } else {
    for (const p of f.patches) {
      const count = (content.match(toRegex(p.find)) || []).length;
      console.log((count === 1 ? "  OK  " : " ERREUR ") + p.name + " : " + count + " occurrence(s)");
      if (count !== 1) problems.push(f.path + " : " + p.name + " (" + count + " occurrence(s) au lieu de 1)");
    }
    if (problems.length === 0) for (const p of f.patches) content = content.replace(toRegex(p.find), () => p.replace.join("\n"));
  }
  results.push({ f, content, crlf });
}
if (problems.length > 0) fail("verifier :\n  - " + problems.join("\n  - "));

for (const r of results) {
  for (const needle of r.f.finals) if (!r.content.includes(needle)) fail("controle final " + r.f.path + " : « " + needle + " » absent apres patch.");
  for (const bad of r.f.forbidden) if (r.content.includes(bad)) fail("controle final " + r.f.path + " : « " + bad + " » est toujours present apres patch.");
}
if (mode === "dry") {
  console.log("\nDRY-RUN termine : les " + FILES.length + " fichiers sont conformes. Rien n'a ete ecrit.");
  console.log("Etape suivante : node scripts/patch-etape1-livraison.mjs --apply");
  process.exit(0);
}
for (const r of results) fs.writeFileSync(r.f.path, r.crlf ? r.content.replace(/\n/g, "\r\n") : r.content, "utf8");
console.log("\nPATCH APPLIQUE : " + results.length + " fichiers modifies.");
console.log("Etapes suivantes : git diff --stat, puis npm run build, puis npm run dev.");
console.log("Retour arriere avant commit : git restore lib/cartTotals.js lib/shippingSettings.js pages/index.js components/AdminShipping.js");
