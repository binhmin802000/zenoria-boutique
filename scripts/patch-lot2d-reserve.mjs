#!/usr/bin/env node
// ============================================================
// PATCH LOT 2d : bague en cours de commande (« Réservée ») et libération au retour de Stripe
//  - lib/shopUtils.js : disponible réel d'un bijou normal = stock moins les paiements en cours (public_stock_states) ;
//    tout réservé -> état « Réservée », non commandable
//  - components/ProductParts.js : phrase validée (« … fait déjà battre un autre cœur … »), commune aux bijoux normaux
//    et aux pièces uniques, et même message prérempli « Écrivez-nous »
//  - pages/index.js, pages/quiz.js : lecture de public_stock_states au chargement (et à l'ouverture du panier sur l'accueil)
//  - pages/api/checkout.js : renvoie le numéro de session Stripe au site
//  - pages/api/checkout-cancel.js (nouveau) : ferme la session Stripe et libère la réservation quand la cliente revient sans payer
// Aucune base de données (public_stock_states existe depuis le lot 2a).
//   node scripts/patch-lot2d-reserve.mjs --dry-run
//   node scripts/patch-lot2d-reserve.mjs --apply
// ============================================================
import fs from "node:fs";
const MARKER = "ZENORIA_STOCK_UI3_V1";
const mode = process.argv.includes("--apply") ? "apply" : process.argv.includes("--dry-run") ? "dry" : null;
const FILES = [
 {
  "path": "lib/shopUtils.js",
  "kind": "anchors",
  "patches": [
   {
    "name": "U1 stockStateMap + disponible reel",
    "find": [
     "// Quantité maximale commandable : le stock saisi dans l'administration (1 pour une pièce unique)"
    ],
    "replace": [
     "// ZENORIA_STOCK_UI3_V1 : disponibilité réelle des bijoux normaux (stock moins les paiements en cours), lue par la fonction",
     "// publique public_stock_states (lot 2a). Map : identifiant -> nombre disponible. Absente ou illisible : null (repli sur le stock).",
     "export function stockStateMap(rows) {",
     "  const m = new Map();",
     "  (Array.isArray(rows) ? rows : []).forEach((r) => {",
     "    if (!r) return;",
     "    const id = Number(r.product_id !== undefined && r.product_id !== null ? r.product_id : r.id);",
     "    const a = Number(r.available);",
     "    if (Number.isFinite(id) && Number.isFinite(a)) m.set(id, Math.max(0, Math.floor(a)));",
     "  });",
     "  return m;",
     "}",
     "// Exemplaires réellement commandables d'un bijou normal : le stock, diminué des paiements en cours si la page les connaît",
     "function availableFor(p) {",
     "  const stock = typeof p.stock === \"number\" && Number.isFinite(p.stock) ? Math.max(0, Math.floor(p.stock)) : 0;",
     "  if (typeof p.available === \"number\" && Number.isFinite(p.available)) return Math.min(stock, Math.max(0, Math.floor(p.available)));",
     "  return stock;",
     "}",
     "// Quantité maximale commandable : le stock saisi dans l'administration (1 pour une pièce unique)"
    ]
   },
   {
    "name": "U2 quantite max = disponible reel",
    "find": [
     "return Math.max(0, Math.floor(Number(product.stock) || 0));",
     "}"
    ],
    "replace": [
     "  return availableFor(product); // ZENORIA_STOCK_UI3_V1",
     "}"
    ]
   },
   {
    "name": "U3 bijou normal tout reserve -> « Réservée »",
    "find": [
     "if (qty > stock) {",
     "return { state: \"insufficient\", orderable: true, stock, label: \"Disponible\", detail: \"\" };",
     "}"
    ],
    "replace": [
     "  const avail = availableFor(p); // ZENORIA_STOCK_UI3_V1 : paiements en cours déduits",
     "  if (avail <= 0) {",
     "    return { state: \"reserved\", orderable: false, stock, label: \"Réservée\", detail: \"\" };",
     "  }",
     "  if (qty > avail) {",
     "    return { state: \"insufficient\", orderable: true, stock, label: \"Disponible\", detail: \"\" };",
     "  }"
    ]
   }
  ],
  "finals": [
   "export function stockStateMap",
   "availableFor(product)",
   "state: \"reserved\", orderable: false, stock"
  ]
 },
 {
  "path": "components/ProductParts.js",
  "kind": "anchors",
  "patches": [
   {
    "name": "P1 encart « réservée » commun + fiche d'un bijou normal reserve",
    "find": [
     "export function UnavailableNotice({ product, contactSettings }) {",
     "if (!product) return null;"
    ],
    "replace": [
     "// ZENORIA_STOCK_UI3_V1 : bague en cours de commande par une autre cliente (bijou normal tout réservé, ou pièce unique réservée).",
     "// Texte validé, sans durée : il vaut pour un paiement par carte (31 min) comme par virement (jusqu'à l'échéance).",
     "export function ReservedNotice({ product, contactSettings, unique = false }) {",
     "  if (!product) return null;",
     "  const link = contactLink(",
     "    contactSettings,",
     "    `À propos de « ${product.name} »`,",
     "    `Bonjour,\\n\\n« ${product.name} » est en cours de commande par une autre cliente. Pourriez-vous me prévenir si elle redevient disponible ?\\n`,",
     "    `Bonjour, « ${product.name} » est en cours de commande par une autre cliente. Pourriez-vous me prévenir si elle redevient disponible ?`",
     "  );",
     "  const cls = unique",
     "    ? \"text-sm leading-6 text-[#54434c] mt-4 rounded-xl bg-[#f5edf1] px-4 py-3\"",
     "    : \"mt-7 text-sm leading-6 text-[#54434c] rounded-xl bg-[#f5edf1] px-4 py-3\";",
     "  return (",
     "    <p data-testid=\"reserved-notice\" data-state=\"reserved\" className={cls}>",
     "      {unique && <span className=\"font-medium\">✦ Pièce unique — </span>}",
     "      {`« ${product.name} » fait déjà battre un autre cœur : une cliente est en train de finaliser sa commande. Si elle ne l'emporte pas, la bague sera de nouveau à vous. `}",
     "      {link ? (",
     "        <>",
     "          <a href={link.href} target={link.external ? \"_blank\" : undefined} rel=\"noopener noreferrer\" className=\"underline text-[#8f6075]\">Écrivez-nous</a>",
     "          {\" pour être prévenue.\"}",
     "        </>",
     "      ) : (",
     "        \"Écrivez-nous pour être prévenue.\"",
     "      )}",
     "    </p>",
     "  );",
     "}",
     "export function UnavailableNotice({ product, contactSettings }) {",
     "  if (!product) return null;",
     "  if (getAvailability(product).state === \"reserved\") return <ReservedNotice product={product} contactSettings={contactSettings} />;"
    ]
   },
   {
    "name": "P2 piece unique reservee : meme phrase",
    "find": [
     "if (state === \"reserved\") {",
     "const link = contactLink(",
     "contactSettings,",
     "`À propos de « ${product.name} »`,",
     "`Bonjour,\\n\\nLa pièce unique « ${product.name} » m'intéresse, mais elle est actuellement réservée. Pourriez-vous me prévenir si elle redevient disponible ?\\n`, // ZENORIA_STOCK_UI2B_V1",
     "`Bonjour, la pièce unique « ${product.name} » m'intéresse, mais elle est actuellement réservée. Pourriez-vous me prévenir si elle redevient disponible ?`",
     ");",
     "return (",
     "<p data-testid=\"unique-notice\" data-state=\"reserved\" className={base}>",
     "<span className=\"font-medium\">✦ Pièce unique</span> — Cette pièce unique est réservée par une autre cliente, dans l&apos;attente de son paiement. Si cette réservation n&apos;aboutit pas, elle pourra être de nouveau proposée.",
     "{link && (",
     "<>",
     "{\" \"}",
     "<a href={link.href} target={link.external ? \"_blank\" : undefined} rel=\"noopener noreferrer\" className=\"underline text-[#8f6075]\">Nous écrire</a>",
     "</>",
     ")}",
     "</p>",
     ");",
     "}"
    ],
    "replace": [
     "  if (state === \"reserved\") {",
     "    return <ReservedNotice product={product} contactSettings={contactSettings} unique />; // ZENORIA_STOCK_UI3_V1",
     "  }"
    ]
   },
   {
    "name": "P3 « Écrivez-nous » d'une bague reservee : meme message prerempli",
    "find": [
     ": a.state === \"reserved\"",
     "? [",
     "`Bonjour,\\n\\nLa pièce unique « ${product.name} » m'intéresse, mais elle est actuellement réservée. Pourriez-vous me prévenir si elle redevient disponible ?\\n`,",
     "`Bonjour, la pièce unique « ${product.name} » m'intéresse, mais elle est actuellement réservée. Pourriez-vous me prévenir si elle redevient disponible ?`,",
     "]"
    ],
    "replace": [
     "      : a.state === \"reserved\"",
     "      ? [",
     "          `Bonjour,\\n\\n« ${product.name} » est en cours de commande par une autre cliente. Pourriez-vous me prévenir si elle redevient disponible ?\\n`,",
     "          `Bonjour, « ${product.name} » est en cours de commande par une autre cliente. Pourriez-vous me prévenir si elle redevient disponible ?`,",
     "        ]"
    ]
   }
  ],
  "finals": [
   "export function ReservedNotice",
   "fait déjà battre un autre cœur",
   "<ReservedNotice product={product} contactSettings={contactSettings} unique />"
  ],
  "forbidden": [
   "Nous écrire</a>",
   "dans l&apos;attente de son paiement"
  ]
 },
 {
  "path": "pages/index.js",
  "kind": "anchors",
  "patches": [
   {
    "name": "I1 import",
    "find": [
     "import { formatPrice, getAvailability, pieceStateMap, maxQtyFor } from \"@/lib/shopUtils\";"
    ],
    "replace": [
     "import { formatPrice, getAvailability, pieceStateMap, maxQtyFor, stockStateMap } from \"@/lib/shopUtils\"; // ZENORIA_STOCK_UI3_V1"
    ]
   },
   {
    "name": "I2 cle du paiement en cours",
    "find": [
     "const CART_STORAGE_KEY = \"zenoria_cart_v2\";"
    ],
    "replace": [
     "const CART_STORAGE_KEY = \"zenoria_cart_v2\";",
     "const PENDING_CHECKOUT_KEY = \"zenoria_pending_checkout\"; // ZENORIA_STOCK_UI3_V1 : session Stripe en cours (cet onglet seulement)"
    ]
   },
   {
    "name": "I3 chargement : resultat de public_stock_states",
    "find": [
     "const [{ data: prodData, error: prodErr }, { data: promoData }, { data: siteData }, famRes, banRes, fxRes, pieceRes] = await Promise.all(["
    ],
    "replace": [
     "const [{ data: prodData, error: prodErr }, { data: promoData }, { data: siteData }, famRes, banRes, fxRes, pieceRes, availRes] = await Promise.all(["
    ]
   },
   {
    "name": "I4 chargement : requete public_stock_states",
    "find": [
     "optionalQuery(supabase.rpc(\"public_piece_states\")), // ZENORIA_STOCK_UI2_V1"
    ],
    "replace": [
     "optionalQuery(supabase.rpc(\"public_piece_states\")), // ZENORIA_STOCK_UI2_V1",
     "        optionalQuery(supabase.rpc(\"public_stock_states\")), // ZENORIA_STOCK_UI3_V1"
    ]
   },
   {
    "name": "I5 produits enrichis du disponible reel",
    "find": [
     "const loadedProducts = !prodErr && prodData ? prodData.map(mapDbProduct).map((p) => ({ ...p, pieceState: pieceMapAtLoad.get(p.id) || null })) : [];"
    ],
    "replace": [
     "const availMapAtLoad = availRes && !availRes.error && Array.isArray(availRes.data) ? stockStateMap(availRes.data) : null;",
     "      const loadedProducts = !prodErr && prodData ? prodData.map(mapDbProduct).map((p) => ({ ...p, pieceState: pieceMapAtLoad.get(p.id) || null, available: availMapAtLoad && availMapAtLoad.has(p.id) ? availMapAtLoad.get(p.id) : null })) : [];"
    ]
   },
   {
    "name": "I6 retour de paiement reussi : plus rien a liberer",
    "find": [
     "if (params.get(\"paiement\") === \"succes\") {",
     "clearCart();"
    ],
    "replace": [
     "    if (params.get(\"paiement\") === \"succes\") {",
     "      try { window.sessionStorage.removeItem(PENDING_CHECKOUT_KEY); } catch (e) { /* stockage indisponible */ } // ZENORIA_STOCK_UI3_V1",
     "      clearCart();"
    ]
   },
   {
    "name": "I7 retour de Stripe sans payer : liberation immediate",
    "find": [
     "// Enregistre le panier à chaque modification"
    ],
    "replace": [
     "  // ZENORIA_STOCK_UI3_V1 : la cliente revient de Stripe sans payer (bouton « retour » de Stripe ou du navigateur).",
     "  // On ferme la session Stripe de CET onglet et on libère sa réservation tout de suite, au lieu d'attendre 31 minutes.",
     "  // La route serveur ne fait rien si la session est déjà payée.",
     "  const refreshStockStates = () => {",
     "    Promise.all([optionalQuery(supabase.rpc(\"public_stock_states\")), optionalQuery(supabase.rpc(\"public_piece_states\"))]).then(([sRes, pRes]) => {",
     "      const sm = sRes && !sRes.error && Array.isArray(sRes.data) ? stockStateMap(sRes.data) : null;",
     "      const pm = pRes && !pRes.error && Array.isArray(pRes.data) ? pieceStateMap(pRes.data) : null;",
     "      if (!sm && !pm) return;",
     "      setProducts((prev) =>",
     "        prev.map((p) => ({",
     "          ...p,",
     "          ...(sm ? { available: sm.has(p.id) ? sm.get(p.id) : null } : {}),",
     "          ...(pm ? { pieceState: pm.get(p.id) || null } : {}),",
     "        }))",
     "      );",
     "    });",
     "  };",
     "  useEffect(() => {",
     "    if (typeof window === \"undefined\") return undefined;",
     "    const releasePending = () => {",
     "      let sid = null;",
     "      try { sid = window.sessionStorage.getItem(PENDING_CHECKOUT_KEY); } catch (e) { sid = null; }",
     "      if (!sid) return;",
     "      try { window.sessionStorage.removeItem(PENDING_CHECKOUT_KEY); } catch (e) { /* stockage indisponible */ }",
     "      if (new URLSearchParams(window.location.search).get(\"paiement\") === \"succes\") return;",
     "      fetch(\"/api/checkout-cancel\", { method: \"POST\", headers: { \"Content-Type\": \"application/json\" }, body: JSON.stringify({ sessionId: sid }) })",
     "        .then((r) => r.json())",
     "        .then((d) => { if (d && d.released) refreshStockStates(); })",
     "        .catch(() => {});",
     "    };",
     "    releasePending();",
     "    const onShow = (e) => { if (e.persisted) releasePending(); };",
     "    window.addEventListener(\"pageshow\", onShow);",
     "    return () => window.removeEventListener(\"pageshow\", onShow);",
     "    // eslint-disable-next-line react-hooks/exhaustive-deps",
     "  }, []);",
     "  // Enregistre le panier à chaque modification"
    ]
   },
   {
    "name": "I8 ouverture du panier : requete public_stock_states",
    "find": [
     "optionalQuery(supabase.rpc(\"public_piece_states\")),",
     "]).then(([stockRes, pieceRes]) => {"
    ],
    "replace": [
     "      optionalQuery(supabase.rpc(\"public_piece_states\")),",
     "      optionalQuery(supabase.rpc(\"public_stock_states\")), // ZENORIA_STOCK_UI3_V1",
     "    ]).then(([stockRes, pieceRes, availRes]) => {"
    ]
   },
   {
    "name": "I9 ouverture du panier : disponible reel",
    "find": [
     "const pieceKnown = Boolean(pieceRes && !pieceRes.error && Array.isArray(pieceRes.data));"
    ],
    "replace": [
     "const pieceKnown = Boolean(pieceRes && !pieceRes.error && Array.isArray(pieceRes.data));",
     "      const availMap = availRes && !availRes.error && Array.isArray(availRes.data) ? stockStateMap(availRes.data) : null;"
    ]
   },
   {
    "name": "I10 ouverture du panier : fusion",
    "find": [
     "pieceState: pieceKnown ? pieceMap.get(p.id) || null : p.pieceState,"
    ],
    "replace": [
     "pieceState: pieceKnown ? pieceMap.get(p.id) || null : p.pieceState,",
     "            available: availMap ? (availMap.has(p.id) ? availMap.get(p.id) : null) : p.available,"
    ]
   },
   {
    "name": "I11 message d'ajout : bague en cours de commande",
    "find": [
     "setCartNotice(p.isUnique === true ? `« ${p.name} » n'est plus disponible.` : `« ${p.name} » est épuisée pour le moment.`);"
    ],
    "replace": [
     "setCartNotice(getAvailability(p).state === \"reserved\" ? `« ${p.name} » est en cours de commande par une autre cliente.` : p.isUnique === true ? `« ${p.name} » n'est plus disponible.` : `« ${p.name} » est épuisée pour le moment.`);"
    ]
   },
   {
    "name": "I12 memorise la session Stripe avant la redirection",
    "find": [
     "if (data && data.ok && data.url) {",
     "window.location.href = data.url;"
    ],
    "replace": [
     "      if (data && data.ok && data.url) {",
     "        if (data.sessionId) {",
     "          try { window.sessionStorage.setItem(PENDING_CHECKOUT_KEY, data.sessionId); } catch (e) { /* stockage indisponible */ } // ZENORIA_STOCK_UI3_V1",
     "        }",
     "        window.location.href = data.url;"
    ]
   }
  ],
  "finals": [
   "ZENORIA_STOCK_UI3_V1",
   "/api/checkout-cancel",
   "public_stock_states",
   "PENDING_CHECKOUT_KEY, data.sessionId"
  ]
 },
 {
  "path": "pages/quiz.js",
  "kind": "anchors",
  "patches": [
   {
    "name": "Q1 import",
    "find": [
     "import { getAvailability, pieceStateMap, maxQtyFor } from \"@/lib/shopUtils\";"
    ],
    "replace": [
     "import { getAvailability, pieceStateMap, maxQtyFor, stockStateMap } from \"@/lib/shopUtils\"; // ZENORIA_STOCK_UI3_V1"
    ]
   },
   {
    "name": "Q2 resultat de public_stock_states",
    "find": [
     "const [prodRes, famRes, banRes, promoRes, pieceRes, contactRes] = await Promise.all(["
    ],
    "replace": [
     "const [prodRes, famRes, banRes, promoRes, pieceRes, contactRes, availRes] = await Promise.all(["
    ]
   },
   {
    "name": "Q3 requete public_stock_states",
    "find": [
     "optionalQuery(supabase.from(SITE_SETTINGS_TABLE).select(\"value\").eq(\"key\", CONTACT_KEY).maybeSingle()),"
    ],
    "replace": [
     "optionalQuery(supabase.from(SITE_SETTINGS_TABLE).select(\"value\").eq(\"key\", CONTACT_KEY).maybeSingle()),",
     "        optionalQuery(supabase.rpc(\"public_stock_states\")),"
    ]
   },
   {
    "name": "Q4 produits enrichis du disponible reel",
    "find": [
     "const products = rawProducts.map((p) => ({ ...p, pieceState: pieceMap.get(p.id) || null }));"
    ],
    "replace": [
     "const availMap = availRes && !availRes.error && Array.isArray(availRes.data) ? stockStateMap(availRes.data) : null;",
     "      const products = rawProducts.map((p) => ({ ...p, pieceState: pieceMap.get(p.id) || null, available: availMap && availMap.has(p.id) ? availMap.get(p.id) : null }));"
    ]
   },
   {
    "name": "Q5 message : bague en cours de commande",
    "find": [
     "setToast({ kind: \"warn\", text: product.isUnique === true ? `« ${product.name} » n'est plus disponible.` : `« ${product.name} » est épuisée pour le moment.` });"
    ],
    "replace": [
     "setToast({ kind: \"warn\", text: getAvailability(product).state === \"reserved\" ? `« ${product.name} » est en cours de commande par une autre cliente.` : product.isUnique === true ? `« ${product.name} » n'est plus disponible.` : `« ${product.name} » est épuisée pour le moment.` });"
    ]
   }
  ],
  "finals": [
   "ZENORIA_STOCK_UI3_V1",
   "public_stock_states",
   "est en cours de commande par une autre cliente"
  ]
 },
 {
  "path": "pages/api/checkout.js",
  "kind": "anchors",
  "patches": [
   {
    "name": "K1 numero de session renvoye au site",
    "find": [
     "return res.status(200).json({ ok: true, url: session.url });"
    ],
    "replace": [
     "return res.status(200).json({ ok: true, url: session.url, sessionId: session.id }); // ZENORIA_STOCK_UI3_V1 : le site le garde pour libérer la réservation si la cliente revient sans payer"
    ]
   }
  ],
  "finals": [
   "sessionId: session.id"
  ]
 },
 {
  "path": "pages/api/checkout-cancel.js",
  "kind": "create",
  "content": "// ZENORIA_STOCK_UI3_V1\n// ============================================================\n// pages/api/checkout-cancel.js — la cliente revient de Stripe sans payer : on ferme sa session et on libère sa réservation.\n//\n// Entrée (POST, JSON) : { sessionId: \"cs_test_...\" }  (gardé par le site dans l'onglet, avant la redirection vers Stripe)\n// Sortie : { ok: true, released: true|false }\n//\n// SÉCURITÉ\n//  - Le numéro de session Stripe est long et impossible à deviner : seul l'onglet qui a lancé le paiement le connaît.\n//  - Rien n'est fait si la session n'est plus « ouverte » (déjà payée ou déjà expirée) : un paiement réussi n'est jamais annulé.\n//  - L'ordre compte : la session est d'abord fermée chez Stripe (plus aucun paiement possible), PUIS la commande « pending »\n//    passe en « expired » et sa réservation est libérée. Le webhook checkout.session.expired qui suit trouvera une commande\n//    qui n'est plus « pending » et ne refera rien.\n// ============================================================\nimport Stripe from \"stripe\";\nimport { supabaseAdmin } from \"@/lib/supabaseAdmin\";\nconst stripe = new Stripe(process.env.STRIPE_SECRET_KEY);\nconst SESSION_RE = /^cs_(test|live)_[A-Za-z0-9]{10,200}$/;\nexport default async function handler(req, res) {\n  if (req.method !== \"POST\") {\n    res.setHeader(\"Allow\", \"POST\");\n    return res.status(405).json({ ok: false, error: \"méthode non autorisée\" });\n  }\n  const sessionId = req.body && typeof req.body.sessionId === \"string\" ? req.body.sessionId.trim() : \"\";\n  if (!SESSION_RE.test(sessionId)) {\n    return res.status(400).json({ ok: false, error: \"session invalide\" });\n  }\n  try {\n    const session = await stripe.checkout.sessions.retrieve(sessionId);\n    if (!session || session.status !== \"open\") {\n      return res.status(200).json({ ok: true, released: false });\n    }\n    await stripe.checkout.sessions.expire(sessionId);\n    const { data: order } = await supabaseAdmin\n      .from(\"orders\")\n      .select(\"id, status\")\n      .eq(\"stripe_session_id\", sessionId)\n      .maybeSingle();\n    if (!order || order.status !== \"pending\") {\n      return res.status(200).json({ ok: true, released: false });\n    }\n    const { error: releaseErr } = await supabaseAdmin.rpc(\"release_order_items\", { p_order_id: order.id, p_reason: \"expired\" });\n    if (releaseErr) {\n      console.error(\"[checkout-cancel] échec release_order_items :\", releaseErr.message);\n    }\n    const { error: updateErr } = await supabaseAdmin.from(\"orders\").update({ status: \"expired\" }).eq(\"id\", order.id).eq(\"status\", \"pending\");\n    if (updateErr) {\n      console.error(\"[checkout-cancel] échec passage en expired :\", updateErr.message);\n    }\n    await supabaseAdmin.from(\"order_status_history\").insert({\n      order_id: order.id,\n      status: \"expired\",\n      note: \"Paiement abandonné par la cliente (retour depuis la page de paiement) : commande close, article(s) remis en vente.\",\n    });\n    return res.status(200).json({ ok: true, released: !releaseErr });\n  } catch (err) {\n    console.error(\"[checkout-cancel]\", err && err.message ? err.message : err);\n    return res.status(200).json({ ok: false, released: false });\n  }\n}\n",
  "finals": [
   "ZENORIA_STOCK_UI3_V1"
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
  if (f.kind === "create") {
    const exists = fs.existsSync(f.path);
    console.log(f.path + " (nouveau fichier)\n" + (exists ? " ERREUR " : "  OK  ") + "le fichier n'existe pas encore");
    if (exists) problems.push(f.path + " existe deja");
    results.push({ f, content: f.content, crlf: false, create: true });
    continue;
  }
  if (!fs.existsSync(f.path)) fail(f.path + " est introuvable. Lancez la commande depuis la racine du projet (dossier zenoria).");
  const original = fs.readFileSync(f.path, "utf8");
  const crlf = original.includes("\r\n");
  let content = original.replace(/\r\n/g, "\n");
  console.log(f.path + " (fins de ligne " + (crlf ? "Windows CRLF" : "Unix LF") + ")");
  if (content.includes(MARKER)) fail(f.path + " : le patch est deja applique (marqueur " + MARKER + " present).");
  const before = problems.length;
  for (const p of f.patches) { const c = (content.match(toRegex(p.find)) || []).length; console.log((c === 1 ? "  OK  " : " ERREUR ") + p.name + " : " + c + " occurrence(s)"); if (c !== 1) problems.push(f.path + " : " + p.name + " (" + c + " occurrence(s) au lieu de 1)"); }
  if (problems.length === before) for (const p of f.patches) content = content.replace(toRegex(p.find), () => p.replace.join("\n"));
  results.push({ f, content, crlf });
}
if (problems.length) fail("verifier :\n  - " + problems.join("\n  - "));
for (const r of results) {
  for (const n of r.f.finals || []) if (!r.content.includes(n)) fail("controle final " + r.f.path + " : « " + n + " » absent apres patch.");
  for (const b of r.f.forbidden || []) if (r.content.includes(b)) fail("controle final " + r.f.path + " : « " + b + " » encore present apres patch.");
}
if (mode === "dry") { console.log("\nDRY-RUN termine : les " + FILES.length + " fichiers sont conformes. Rien n'a ete ecrit."); process.exit(0); }
for (const r of results) fs.writeFileSync(r.f.path, r.crlf ? r.content.replace(/\n/g, "\r\n") : r.content, "utf8");
console.log("\nPATCH APPLIQUE : " + results.length + " fichiers (1 cree, " + (results.length - 1) + " modifies).");
console.log("Retour arriere avant commit : git restore lib/shopUtils.js components/ProductParts.js pages/index.js pages/quiz.js pages/api/checkout.js ; supprimer pages/api/checkout-cancel.js");
