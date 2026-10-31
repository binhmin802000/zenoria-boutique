#!/usr/bin/env node
// ============================================================
// PATCH LOT 1b : frais de livraison reglables dans l'admin (champ « fee » du reglage « shipping »)
// Fichiers modifies (aucun autre, aucune base de donnees) :
//   lib/shippingSettings.js    remplace : champ « fee » (lecture, validation 0,50 a 50,00, saisie, format)
//   lib/cartTotals.js          remplace : les frais viennent du reglage (4,90 EUR par defaut)
//   components/AdminShipping.js   champ « Frais de livraison » dans la carte « Livraison offerte »
// Non modifies : pages/index.js, pages/quiz.js, pages/api/checkout.js, pages/api/checkout-transfer.js
//   (ils lisent le reglage avec parseShippingSetting et appellent computeTotals : ils suivent automatiquement).
// A faire AVANT ou APRES, sans ordre impose : sql/lot1b_shipping_fee_constraint.sql (controle de la valeur par la base).
//
// Usage, depuis la racine du projet (dossier zenoria) :
//   node scripts/patch-lot1b-frais-livraison.mjs --dry-run   -> controle chaque repere, n'ecrit RIEN
//   node scripts/patch-lot1b-frais-livraison.mjs --apply     -> ecrit les 3 fichiers si TOUT est conforme
// Garde-fous : rien n'est ecrit si un repere est absent ou en double, ou si le patch est deja applique.
// ============================================================
import fs from "node:fs";

const MARKER = "ZENORIA_SHIPPING_FEE_V1";
const mode = process.argv.includes("--apply") ? "apply" : process.argv.includes("--dry-run") ? "dry" : null;
const FILES = [
 {
  "path": "lib/shippingSettings.js",
  "kind": "replace",
  "mustContain": [
   "ZENORIA_SHIPPING_RULE_V1",
   "export function qualifiesForFreeShipping",
   "export const DEFAULT_SHIPPING = Object.freeze({ enabled: true, threshold: 75 });"
  ],
  "content": "// ZENORIA_SHIPPING_FEE_V1\n// ============================================================\n// RÉGLAGE DE LA LIVRAISON : seuil de livraison offerte, interrupteur et frais de livraison\n//\n// Fichier SANS dépendance : il est utilisé par la page d'accueil (pages/index.js), la page du quiz (pages/quiz.js,\n// components/QuizChrome.js), les routes de paiement (pages/api/checkout.js, pages/api/checkout-transfer.js), le calcul du\n// panier (lib/cartTotals.js) et l'administration (components/AdminShipping.js, onglet « Contenu du site »).\n//\n// Enregistrement : table « site_settings », clé « shipping », valeur JSON :\n//     { \"enabled\": true, \"threshold\": 75, \"fee\": 4.9 }\n//   enabled   : interrupteur « Livraison offerte » (true : activée, false : désactivée)\n//   threshold : montant en euros, entier de 1 à 1 000, comparé au montant du panier AVANT code promo (>=)  // ZENORIA_SHIPPING_RULE_V1\n//   fee       : frais de livraison en euros, de 0,50 à 50,00 (centimes autorisés), facturés quand la livraison n'est pas offerte.\n//               Facultatif : absent ou illisible, on utilise la valeur par défaut (4,90 €).\n// Voir supabase_shipping.sql et sql/lot1b_shipping_fee_constraint.sql (contrôle de la valeur par la base).\n//\n// Livraison désactivée :\n//   - le segment « Livraison offerte dès X € » disparaît du bandeau (accueil et quiz) ;\n//   - la barre « Plus que X € pour la livraison offerte » et la phrase du panier disparaissent ;\n//   - la livraison est facturée quel que soit le montant du panier (frais : le champ « fee ») ;\n//   - les codes promo ne changent pas le droit à la livraison offerte : ils se déduisent du montant du panier.\n//\n// Si le réglage est absent ou illisible (script SQL pas encore exécuté, réseau coupé, valeur abîmée), le site\n// utilise DEFAULT_SHIPPING : activée, 75 €, frais de 4,90 €.\n// ============================================================\nexport const SHIPPING_KEY = \"shipping\";\nexport const SHIPPING_MIN = 1;\nexport const SHIPPING_MAX = 1000;\nexport const SHIPPING_FEE_MIN = 0.5; // Stripe refuse un paiement inférieur à 0,50 € : les frais ne doivent jamais descendre en dessous\nexport const SHIPPING_FEE_MAX = 50;\nexport const DEFAULT_SHIPPING = Object.freeze({ enabled: true, threshold: 75, fee: 4.9 });\n// Le bandeau du haut de page, sans son premier segment\nconst STRIP_BASE = \"Créations façonnées à la main en cristaux Swarovski · Paiement sécurisé\";\nexport function isValidThreshold(n) {\n  return typeof n === \"number\" && Number.isInteger(n) && n >= SHIPPING_MIN && n <= SHIPPING_MAX;\n}\n// Frais valides : nombre, de 0,50 à 50,00, avec au plus deux décimales\nexport function isValidFee(n) {\n  return (\n    typeof n === \"number\" &&\n    Number.isFinite(n) &&\n    n >= SHIPPING_FEE_MIN &&\n    n <= SHIPPING_FEE_MAX &&\n    Math.abs(n * 100 - Math.round(n * 100)) < 1e-6\n  );\n}\n// « 4,90 » : montant en euros à la française, deux décimales\nexport function formatFee(n) {\n  return Number(n).toFixed(2).replace(\".\", \",\");\n}\n// Lit la valeur enregistrée. Tout ce qui n'est pas reconnu redonne la valeur par défaut, champ par champ :\n// le site n'affiche jamais un montant inventé ni une livraison désactivée par accident.\nexport function parseShippingSetting(value) {\n  const v = value && typeof value === \"object\" && !Array.isArray(value) ? value : {};\n  return {\n    enabled: typeof v.enabled === \"boolean\" ? v.enabled : DEFAULT_SHIPPING.enabled,\n    threshold: isValidThreshold(v.threshold) ? v.threshold : DEFAULT_SHIPPING.threshold,\n    fee: isValidFee(v.fee) ? Math.round(v.fee * 100) / 100 : DEFAULT_SHIPPING.fee,\n  };\n}\n// Valeur à enregistrer depuis le formulaire (toujours complète et valide)\nexport function buildShippingValue(s) {\n  return parseShippingSetting(s);\n}\nexport function sameShippingSetting(a, b) {\n  const x = parseShippingSetting(a);\n  const y = parseShippingSetting(b);\n  return x.enabled === y.enabled && x.threshold === y.threshold && x.fee === y.fee;\n}\n// Saisie du montant dans l'administration : entier d'euros uniquement (un « € » final est toléré)\nexport function parseThresholdInput(text) {\n  const t = String(text === null || text === undefined ? \"\" : text).trim().replace(/\\s+/g, \"\").replace(/€$/, \"\");\n  if (!/^\\d+$/.test(t)) return { ok: false, value: null, error: \"Saisissez un nombre entier d'euros, sans virgule ni décimales.\" };\n  const n = Number(t);\n  if (n < SHIPPING_MIN || n > SHIPPING_MAX) return { ok: false, value: null, error: `Le montant doit être compris entre ${SHIPPING_MIN} et 1 000 €.` };\n  return { ok: true, value: n, error: \"\" };\n}\n// Saisie des frais dans l'administration : « 4,90 », « 4.9 » ou « 6,5 € » (virgule ou point, deux décimales au plus)\nexport function parseFeeInput(text) {\n  const t = String(text === null || text === undefined ? \"\" : text).trim().replace(/\\s+/g, \"\").replace(/€$/, \"\").replace(\",\", \".\");\n  if (!/^\\d{1,3}(\\.\\d{1,2})?$/.test(t)) {\n    return { ok: false, value: null, error: \"Saisissez un montant en euros, avec au plus deux décimales (par exemple 4,90).\" };\n  }\n  const n = Math.round(Number(t) * 100) / 100;\n  if (n < SHIPPING_FEE_MIN || n > SHIPPING_FEE_MAX) {\n    return { ok: false, value: null, error: `Les frais doivent être compris entre ${formatFee(SHIPPING_FEE_MIN)} et ${formatFee(SHIPPING_FEE_MAX)} €.` };\n  }\n  return { ok: true, value: n, error: \"\" };\n}\n// Règle unique : la livraison est offerte quand elle est activée et que le montant du panier, AVANT code promo, atteint le seuil.\n// (Le calcul complet est dans lib/cartTotals.js ; un code promo ne change jamais ce droit.)\nexport function qualifiesForFreeShipping(setting, cartAmount) {\n  const s = parseShippingSetting(setting);\n  return s.enabled && Number(cartAmount) >= s.threshold;\n}\n// Bandeau du haut de page : « Livraison offerte dès 75 € · Créations façonnées… » ou, livraison désactivée, sans le premier segment\nexport function shippingStripText(setting) {\n  const s = parseShippingSetting(setting);\n  return s.enabled ? `Livraison offerte dès ${s.threshold} € · ${STRIP_BASE}` : STRIP_BASE;\n}\n// Texte du réglage enregistré, pour l'administration\nexport function describeShipping(setting) {\n  const s = parseShippingSetting(setting);\n  const base = s.enabled ? `livraison offerte dès ${s.threshold} €` : `livraison offerte désactivée (montant conservé : ${s.threshold} €)`;\n  return `${base} · frais de livraison ${formatFee(s.fee)} €`;\n}\n// Lecture côté site. Ne lève jamais d'erreur : en cas de problème, on renvoie le réglage par défaut.\nexport async function fetchShippingSetting(client, table = \"site_settings\") {\n  try {\n    const res = await client.from(table).select(\"value\").eq(\"key\", SHIPPING_KEY).maybeSingle();\n    if (res && !res.error && res.data) return parseShippingSetting(res.data.value);\n  } catch (e) {\n    // réglage illisible : valeur par défaut\n  }\n  return DEFAULT_SHIPPING;\n}\n",
  "finals": [
   "export function parseFeeInput",
   "export function isValidFee",
   "fee: isValidFee(v.fee)",
   "ZENORIA_SHIPPING_FEE_V1"
  ],
  "forbidden": []
 },
 {
  "path": "lib/cartTotals.js",
  "kind": "replace",
  "mustContain": [
   "ZENORIA_SHIPPING_RULE_V1",
   "export const SHIPPING_FEE = 4.9",
   "shipping = free ? 0 : SHIPPING_FEE;"
  ],
  "content": "// ZENORIA_CART_TOTALS_V1\n// ZENORIA_SHIPPING_RULE_V1\n// ZENORIA_SHIPPING_FEE_V1\n// ============================================================\n// lib/cartTotals.js\n//\n// Calcul du panier : SOURCE UNIQUE, partagee par le site (pages/index.js) et par les routes de paiement\n// (pages/api/checkout.js pour la carte, pages/api/checkout-transfer.js pour le virement).\n// Le montant affiche a la cliente et le montant facture sont donc TOUJOURS identiques.\n// Ne JAMAIS recopier ce calcul dans une page : l'importer.\n//\n// REGLE DE LA LIVRAISON OFFERTE (unique : panier, barre de progression, carte, virement)\n//   S = montant du panier = somme des (prix effectif x quantite), AVANT tout code promo.\n//   - livraison offerte activee (reglage admin) ET S >= seuil (reglage admin) : livraison offerte ;\n//   - sinon : frais de livraison. Ils se reglent dans l'admin (Contenu du site > Livraison offerte), cle « shipping »,\n//     champ « fee » ; valeur par defaut 4,90 EUR si le champ est absent ou illisible (voir lib/shippingSettings.js).\n//   Un code promo se deduit de S pour le montant a payer ; il ne change JAMAIS le droit a la livraison offerte.\n//   Un code dont le type est \"shipping\" n'a donc plus d'effet : sa remise est nulle.\n//   A payer = S - remise + livraison.\n//   « Plus que X EUR » et la barre de progression = seuil - S (jamais negatif), seulement si la livraison offerte est activee.\n// Filet de securite : si le montant apres remise est inferieur a MIN_CHARGE (Stripe refuse moins de 0,50 EUR),\n//   la livraison est facturee meme si le seuil est atteint. Les frais valent au moins 0,50 EUR : le total ne tombe jamais sous MIN_CHARGE.\n// ============================================================\nimport { DEFAULT_SHIPPING, parseShippingSetting, qualifiesForFreeShipping } from \"./shippingSettings\";\nexport const SHIPPING_FEE = DEFAULT_SHIPPING.fee; // frais par DEFAUT (4,90 EUR) ; les frais reels viennent du reglage de l'admin (champ « fee »)\nexport const MIN_CHARGE = 0.5; // montant minimal facturable par Stripe (EUR)\nexport const round2 = (n) => Math.round(n * 100) / 100;\n// Prix reellement applique : le prix promotionnel s'il est defini et inferieur au prix normal.\nexport const effectivePrice = (p) => (p.promoPrice != null && p.promoPrice < p.price ? p.promoPrice : p.price);\n// Calcul des montants du panier (sous-total, remise, livraison, total, reste a atteindre)\nexport function computeTotals(lines, promo, shippingCfg = DEFAULT_SHIPPING) {\n  const cfg = parseShippingSetting(shippingCfg); // reglage complet et valide : seuil, interrupteur, frais\n  const subtotal = round2(lines.reduce((s, l) => s + effectivePrice(l.product) * l.qty, 0));\n  let discount = 0;\n  if (promo && promo.type === \"percent\") discount = round2((subtotal * promo.value) / 100);\n  if (promo && promo.type === \"fixed\") discount = Math.min(promo.value, subtotal);\n  const discounted = round2(subtotal - discount);\n  let shipping = 0;\n  if (lines.length > 0) {\n    // le seuil se compare au montant du panier AVANT code promo ; le filet MIN_CHARGE evite un paiement inferieur a 0,50 EUR\n    const free = qualifiesForFreeShipping(cfg, subtotal) && discounted >= MIN_CHARGE;\n    shipping = free ? 0 : cfg.fee;\n  }\n  const total = round2(discounted + shipping);\n  const remaining = cfg.enabled ? round2(Math.max(0, cfg.threshold - subtotal)) : 0;\n  return { subtotal, discount, shipping, total, remaining, freeShipping: lines.length > 0 && shipping === 0 };\n}\n",
  "finals": [
   "parseShippingSetting(shippingCfg)",
   "shipping = free ? 0 : cfg.fee;",
   "ZENORIA_SHIPPING_FEE_V1"
  ],
  "forbidden": [
   "shipping = free ? 0 : SHIPPING_FEE;",
   "export const SHIPPING_FEE = 4.9"
  ]
 },
 {
  "path": "components/AdminShipping.js",
  "kind": "anchors",
  "patches": [
   {
    "name": "A1 repere du lot (commentaire)",
    "find": [
     "const TIME_ZONE = \"Europe/Paris\";"
    ],
    "replace": [
     "// ZENORIA_SHIPPING_FEE_V1 : les frais de livraison (champ « fee » du réglage) se règlent ici, entre 0,50 et 50,00 €.",
     "const TIME_ZONE = \"Europe/Paris\";"
    ]
   },
   {
    "name": "A2 imports : saisie et format des frais",
    "find": [
     "parseThresholdInput,",
     "qualifiesForFreeShipping,"
    ],
    "replace": [
     "parseThresholdInput,",
     "  parseFeeInput,",
     "  formatFee,",
     "  qualifiesForFreeShipping,"
    ]
   },
   {
    "name": "A3 etat de la saisie des frais",
    "find": [
     "const [text, setText] = useState(String(DEFAULT_SHIPPING.threshold));"
    ],
    "replace": [
     "const [text, setText] = useState(String(DEFAULT_SHIPPING.threshold));",
     "  const [feeText, setFeeText] = useState(formatFee(DEFAULT_SHIPPING.fee));"
    ]
   },
   {
    "name": "A4 chargement : frais enregistres",
    "find": [
     "setText(String(parsed.threshold));"
    ],
    "replace": [
     "setText(String(parsed.threshold));",
     "        setFeeText(formatFee(parsed.fee));"
    ]
   },
   {
    "name": "A5 validation et brouillon (seuil + frais)",
    "find": [
     "const input = useMemo(() => parseThresholdInput(text), [text]);",
     "const draft = input.ok ? { enabled, threshold: input.value } : null;"
    ],
    "replace": [
     "const input = useMemo(() => parseThresholdInput(text), [text]);",
     "  const feeInput = useMemo(() => parseFeeInput(feeText), [feeText]);",
     "  const draft = input.ok && feeInput.ok ? { enabled, threshold: input.value, fee: feeInput.value } : null;"
    ]
   },
   {
    "name": "A6 apercu : dernier montant et dernier frais valides",
    "find": [
     "const shown = draft || { enabled, threshold: saved.threshold };"
    ],
    "replace": [
     "const shown = { enabled, threshold: input.ok ? input.value : saved.threshold, fee: feeInput.ok ? feeInput.value : saved.fee };"
    ]
   },
   {
    "name": "A7 message d'erreur a l'enregistrement",
    "find": [
     "setError(input.error);"
    ],
    "replace": [
     "setError(input.ok ? feeInput.error : input.error);"
    ]
   },
   {
    "name": "A8 champ des frais de livraison",
    "find": [
     "</label>",
     "<div className=\"mt-5 rounded-xl bg-[#faf6f8] border border-[#eee2e5] px-4 py-3\">"
    ],
    "replace": [
     "</label>",
     "      <label className=\"block mt-4 text-sm\">",
     "        <span className=\"block text-xs text-[#8b737e]\">Frais de livraison (facturés quand la livraison n&apos;est pas offerte)</span>",
     "        <span className=\"mt-1 flex items-center gap-2\">",
     "          <input",
     "            type=\"text\"",
     "            inputMode=\"decimal\"",
     "            value={feeText}",
     "            disabled={disabled}",
     "            onChange={(e) => {",
     "              setFeeText(e.target.value);",
     "              setError(\"\");",
     "            }}",
     "            aria-invalid={!feeInput.ok}",
     "            aria-describedby=\"shipping-fee-help\"",
     "            data-testid=\"shipping-fee\"",
     "            className=\"w-32 rounded-xl border border-[#eadfe4] px-3 h-10 outline-none focus:border-[#8f6075] bg-white disabled:opacity-60\"",
     "          />",
     "          <span className=\"text-sm text-[#54434c]\">€</span>",
     "        </span>",
     "        <span id=\"shipping-fee-help\" className={`block text-[11px] mt-1 leading-4 ${feeInput.ok ? \"text-[#8b737e]\" : \"text-red-600\"}`} data-testid=\"shipping-fee-help\">",
     "          {feeInput.ok",
     "            ? \"De 0,50 à 50,00 €, centimes autorisés. Ce montant est facturé sous le seuil (ou toujours si la livraison offerte est désactivée) et s'applique aux prochaines commandes, par carte comme par virement.\"",
     "            : feeInput.error}",
     "        </span>",
     "      </label>",
     "      <div className=\"mt-5 rounded-xl bg-[#faf6f8] border border-[#eee2e5] px-4 py-3\">"
    ]
   },
   {
    "name": "A9 exemple : montant des frais",
    "find": [
     "(avant code promo) : livraison {e.free ? \"offerte\" : \"facturée\"}."
    ],
    "replace": [
     "(avant code promo) : livraison {e.free ? \"offerte\" : \"facturée \" + formatFee(shown.fee) + \" €\"}."
    ]
   },
   {
    "name": "A10 livraison desactivee : montant des frais",
    "find": [
     "<li>Tous les paniers paient la livraison.</li>"
    ],
    "replace": [
     "<li>Tous les paniers paient la livraison ({formatFee(shown.fee)} €).</li>"
    ]
   },
   {
    "name": "A11 note finale (frais reglables)",
    "find": [
     "Les frais de livraison sous le seuil restent réglés dans le code du site. Le calcul de la livraison suit une règle unique, partagée par le site, le paiement par carte et le paiement par virement."
    ],
    "replace": [
     "Les frais de livraison se règlent ci-dessus et s&apos;appliquent aux prochaines commandes. Le calcul de la livraison suit une règle unique, partagée par le site, le paiement par carte et le paiement par virement."
    ]
   },
   {
    "name": "A12 message de refus par la base",
    "find": [
     "La valeur est refusée par la base. Exécutez le script supabase_shipping.sql dans Supabase (SQL Editor), puis réessayez."
    ],
    "replace": [
     "La valeur est refusée par la base. Vérifiez le montant et les frais de livraison, puis réessayez."
    ]
   }
  ],
  "finals": [
   "parseFeeInput",
   "data-testid=\"shipping-fee\"",
   "ZENORIA_SHIPPING_FEE_V1",
   "formatFee(shown.fee)"
  ],
  "forbidden": [
   "restent réglés dans le code du site"
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
// Les lignes d'un repere sont comparees sans tenir compte des espaces/fins de ligne.
const toRegex = (lines) => new RegExp(escapeRegex(lines.map((l) => l.trim()).join("\n")).replace(/\s+/g, "\\s+"), "g");

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
  console.log("Etape suivante : node scripts/patch-lot1b-frais-livraison.mjs --apply");
  process.exit(0);
}
for (const r of results) fs.writeFileSync(r.f.path, r.crlf ? r.content.replace(/\n/g, "\r\n") : r.content, "utf8");
console.log("\nPATCH APPLIQUE : " + results.length + " fichiers modifies.");
console.log("Etapes suivantes : git diff --stat, puis npm run build, puis npm run dev.");
console.log("Retour arriere avant commit : git restore lib/shippingSettings.js lib/cartTotals.js components/AdminShipping.js");
