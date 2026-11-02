#!/usr/bin/env node
// ============================================================
// PATCH LOT 2c-2 : pages, panier et donnees (a appliquer APRES le 2c-1, sur la meme branche lot2c-stock-ecrans)
// Modifie : lib/shopUtils.js, components/ProductParts.js, pages/index.js, pages/quiz.js, lib/quizState.js, pages/compte.js
// Aucune base de donnees.
//   - plus de plafond fixe de 10 : la limite est le stock saisi dans l'admin (1 pour une piece unique)
//   - lecture de l'etat des pieces uniques (public_piece_states) au chargement, puis a l'ouverture du panier
//   - lien « Ecrivez-nous » sur la fiche (accueil et quiz) et sur la carte d'un bijou normal epuise
//   - messages valides sous une ligne de panier non commandable ; bouton Commander bloque tant qu'elle n'est pas corrigee
//
//   node scripts/patch-lot2c2-panier.mjs --dry-run
//   node scripts/patch-lot2c2-panier.mjs --apply
// ============================================================
import fs from "node:fs";
const MARKER = "ZENORIA_STOCK_UI2_V1";
const mode = process.argv.includes("--apply") ? "apply" : process.argv.includes("--dry-run") ? "dry" : null;
const FILES = [
 {
  "path": "lib/shopUtils.js",
  "patches": [
   {
    "name": "U1 pieceStateMap + maxQtyFor (partages accueil / quiz)",
    "find": [
     "export function getAvailability(product, qty = 0) {"
    ],
    "replace": [
     "// ZENORIA_STOCK_UI2_V1 : état des pièces uniques lu par la fonction publique public_piece_states.",
     "// Tolérant au nom des colonnes (product_id ou id ; state ou status). Seuls « reserved » et « sold » sont retenus.",
     "export function pieceStateMap(rows) {",
     "  const m = new Map();",
     "  (Array.isArray(rows) ? rows : []).forEach((r) => {",
     "    if (!r) return;",
     "    const id = Number(r.product_id !== undefined && r.product_id !== null ? r.product_id : r.id);",
     "    const s = r.state !== undefined && r.state !== null ? r.state : r.status;",
     "    if (Number.isFinite(id) && (s === \"reserved\" || s === \"sold\")) m.set(id, s);",
     "  });",
     "  return m;",
     "}",
     "// Quantité maximale commandable : le stock saisi dans l'administration (1 pour une pièce unique)",
     "export function maxQtyFor(product) {",
     "  if (!product) return 0;",
     "  if (product.isUnique === true) return 1;",
     "  return Math.max(0, Math.floor(Number(product.stock) || 0));",
     "}",
     "export function getAvailability(product, qty = 0) {"
    ]
   }
  ],
  "finals": [
   "export function pieceStateMap",
   "export function maxQtyFor"
  ],
  "forbidden": []
 },
 {
  "path": "components/ProductParts.js",
  "patches": [
   {
    "name": "P1 messages du panier et « Écrivez-nous » du catalogue",
    "find": [
     "export function UnavailableNotice({ product, contactSettings }) {"
    ],
    "replace": [
     "// ZENORIA_STOCK_UI2_V1 : message sous une ligne du panier qui ne peut pas être commandée telle quelle (textes validés)",
     "export function CartLineNotice({ product, state, contactSettings }) {",
     "  if (!product) return null;",
     "  if (state === \"insufficient\") {",
     "    const link = contactLink(",
     "      contactSettings,",
     "      `À propos de « ${product.name} »`,",
     "      `Bonjour,\\n\\nJe souhaiterais davantage d'exemplaires de « ${product.name} ». Est-ce possible ?\\n`,",
     "      `Bonjour, je souhaiterais davantage d'exemplaires de « ${product.name} ». Est-ce possible ?`",
     "    );",
     "    return (",
     "      <div data-testid=\"cart-line-insufficient\" className=\"text-[11px] leading-4 text-amber-800 mt-1\">",
     "        {`Il ne reste pas assez d'exemplaires de « ${product.name} » : réduisez la quantité pour continuer. Si vous en souhaitez davantage, `}",
     "        {link ? (",
     "          <a href={link.href} target={link.external ? \"_blank\" : undefined} rel=\"noopener noreferrer\" className=\"underline\">écrivez-nous</a>",
     "        ) : (",
     "          \"écrivez-nous\"",
     "        )}",
     "        .",
     "      </div>",
     "    );",
     "  }",
     "  return (",
     "    <div data-testid=\"cart-line-unavailable\" className=\"text-[11px] leading-4 text-red-700 mt-1\">",
     "      {`« ${product.name} » n'est plus disponible. Retirez cet article de votre panier pour continuer.`}",
     "    </div>",
     "  );",
     "}",
     "// Carte du catalogue d'un bijou normal épuisé : « Écrivez-nous » à la place du bouton « Ajouter au panier »",
     "export function CatalogWriteUs({ product, contactSettings }) {",
     "  if (!product) return null;",
     "  const link = contactLink(",
     "    contactSettings,",
     "    `À propos de « ${product.name} »`,",
     "    `Bonjour,\\n\\nJe souhaite savoir si « ${product.name} » sera de nouveau disponible. Pouvez-vous me prévenir ?\\n`,",
     "    `Bonjour, je souhaite savoir si « ${product.name} » sera de nouveau disponible. Pouvez-vous me prévenir ?`",
     "  );",
     "  const cls = \"flex w-full mt-5 h-10 items-center justify-center rounded-full border border-[#d9c5cc] text-sm text-[#8f6075] hover:bg-[#f5edf1] transition\";",
     "  return link ? (",
     "    <a href={link.href} target={link.external ? \"_blank\" : undefined} rel=\"noopener noreferrer\" data-testid=\"catalog-write-us\" className={cls}>",
     "      Écrivez-nous",
     "    </a>",
     "  ) : (",
     "    <span data-testid=\"catalog-write-us\" className={cls}>Épuisé</span>",
     "  );",
     "}",
     "// Bijou normal épuisé : remplace le bouton « Ajouter au panier » (texte validé)",
     "export function UnavailableNotice({ product, contactSettings }) {"
    ]
   },
   {
    "name": "P2 message prerempli « Nous écrire » d'une piece reservee (texte valide)",
    "find": [
     "`Bonjour,\\n\\nLa pièce unique « ${product.name} » est réservée. Pourriez-vous me dire si elle se libère ?\\n`,",
     "`Bonjour, la pièce unique « ${product.name} » est réservée. Pourriez-vous me dire si elle se libère ?`"
    ],
    "replace": [
     "`Bonjour,\\n\\nLa pièce unique « ${product.name} » m'intéresse, mais elle est actuellement réservée. Pourriez-vous me prévenir si elle redevient disponible ?\\n`,",
     "      `Bonjour, la pièce unique « ${product.name} » m'intéresse, mais elle est actuellement réservée. Pourriez-vous me prévenir si elle redevient disponible ?`"
    ]
   }
  ],
  "finals": [
   "export function CartLineNotice",
   "export function CatalogWriteUs",
   "redevient disponible"
  ],
  "forbidden": [
   "si elle se libère"
  ]
 },
 {
  "path": "pages/index.js",
  "patches": [
   {
    "name": "I1 imports ProductParts",
    "find": [
     "import { RingVisual, AvailabilityBadge, PriceTag } from \"@/components/ProductParts\";"
    ],
    "replace": [
     "import { RingVisual, AvailabilityBadge, PriceTag, PieceUniqueNotice, CartLineNotice, CatalogWriteUs } from \"@/components/ProductParts\"; // ZENORIA_STOCK_UI2_V1"
    ]
   },
   {
    "name": "I2 imports shopUtils",
    "find": [
     "import { formatPrice, getAvailability } from \"@/lib/shopUtils\";"
    ],
    "replace": [
     "import { formatPrice, getAvailability, pieceStateMap, maxQtyFor } from \"@/lib/shopUtils\";"
    ]
   },
   {
    "name": "I3 plus de plafond fixe de 10",
    "find": [
     "const MAX_QTY_PER_PRODUCT = 10;         // quantité max par bague (stock + fabrication sur commande)",
     "// Le délai de fabrication une fois le stock épuisé (BACKORDER_LEAD_TIME) se règle dans lib/shopUtils.js"
    ],
    "replace": [
     "// ZENORIA_STOCK_UI2_V1 : plus de plafond fixe. La quantité maximale est le stock saisi dans l'administration (1 pour une pièce unique) : maxQtyFor (lib/shopUtils.js)."
    ]
   },
   {
    "name": "I4 chargement : lecture de l'etat des pieces uniques",
    "find": [
     "const [{ data: prodData, error: prodErr }, { data: promoData }, { data: siteData }, famRes, banRes, fxRes] = await Promise.all(["
    ],
    "replace": [
     "const [{ data: prodData, error: prodErr }, { data: promoData }, { data: siteData }, famRes, banRes, fxRes, pieceRes] = await Promise.all(["
    ]
   },
   {
    "name": "I5 requete public_piece_states",
    "find": [
     "optionalQuery(supabase.from(SITE_SETTINGS_TABLE).select(\"key, value\").in(\"key\", [SEASON_FX_KEY, SHIPPING_KEY, SITE_TEXTS_KEY, CONTACT_KEY, REVIEWS_KEY, PAYMENT_METHODS_KEY])),"
    ],
    "replace": [
     "optionalQuery(supabase.from(SITE_SETTINGS_TABLE).select(\"key, value\").in(\"key\", [SEASON_FX_KEY, SHIPPING_KEY, SITE_TEXTS_KEY, CONTACT_KEY, REVIEWS_KEY, PAYMENT_METHODS_KEY])),",
     "        optionalQuery(supabase.rpc(\"public_piece_states\")), // ZENORIA_STOCK_UI2_V1"
    ]
   },
   {
    "name": "I6 produits enrichis de l'etat des pieces",
    "find": [
     "const loadedProducts = !prodErr && prodData ? prodData.map(mapDbProduct) : [];"
    ],
    "replace": [
     "const pieceMapAtLoad = pieceStateMap(pieceRes && !pieceRes.error ? pieceRes.data : null);",
     "      const loadedProducts = !prodErr && prodData ? prodData.map(mapDbProduct).map((p) => ({ ...p, pieceState: pieceMapAtLoad.get(p.id) || null })) : [];"
    ]
   },
   {
    "name": "I7 panier restaure : plus de plafond de 10 (piece unique a 1)",
    "find": [
     "return p ? { id: p.id, qty: Math.min(MAX_QTY_PER_PRODUCT, Math.max(1, Number(i.qty) || 1)) } : null;"
    ],
    "replace": [
     "return p ? { id: p.id, qty: p.isUnique === true ? 1 : Math.max(1, Number(i.qty) || 1) } : null;"
    ]
   },
   {
    "name": "I8 panier bloque si une ligne n'est pas commandable",
    "find": [
     "const cartCount = cartLines.reduce((s, l) => s + l.qty, 0);"
    ],
    "replace": [
     "const cartCount = cartLines.reduce((s, l) => s + l.qty, 0);",
     "  const cartBlocked = cartLines.some(({ product, qty }) => { const a = getAvailability(product, qty); return !a.orderable || a.state === \"insufficient\"; }); // ZENORIA_STOCK_UI2_V1"
    ]
   },
   {
    "name": "I9 verification a l'ouverture du panier",
    "find": [
     "useEffect(() => {",
     "if (!cartOpen) { setCheckoutError(\"\"); setPieceUnavailableIds([]); } // ZENORIA_STEP3C_V1 : un message d'erreur ou une piece indisponible ne survit pas a la fermeture du panier",
     "}, [cartOpen]);"
    ],
    "replace": [
     "useEffect(() => {",
     "    if (!cartOpen) { setCheckoutError(\"\"); setPieceUnavailableIds([]); } // ZENORIA_STEP3C_V1 : un message d'erreur ou une piece indisponible ne survit pas a la fermeture du panier",
     "  }, [cartOpen]);",
     "  // ZENORIA_STOCK_UI2_V1 : à l'ouverture du panier, une seule lecture du stock et de l'état des pièces des articles du panier",
     "  // (pas d'interrogation régulière : le serveur reste la seule garantie au moment de payer).",
     "  useEffect(() => {",
     "    if (!cartOpen || cartItems.length === 0) return undefined;",
     "    let alive = true;",
     "    const ids = cartItems.map((i) => i.id);",
     "    Promise.all([",
     "      optionalQuery(supabase.from(\"products\").select(\"id, stock, is_unique, active\").in(\"id\", ids)),",
     "      optionalQuery(supabase.rpc(\"public_piece_states\")),",
     "    ]).then(([stockRes, pieceRes]) => {",
     "      if (!alive) return;",
     "      const rows = stockRes && !stockRes.error && Array.isArray(stockRes.data) ? stockRes.data : null;",
     "      if (!rows) return;",
     "      const pieceMap = pieceStateMap(pieceRes && !pieceRes.error ? pieceRes.data : null);",
     "      const pieceKnown = Boolean(pieceRes && !pieceRes.error && Array.isArray(pieceRes.data));",
     "      setProducts((prev) =>",
     "        prev.map((p) => {",
     "          const r = rows.find((x) => x.id === p.id);",
     "          if (!r) return p;",
     "          return {",
     "            ...p,",
     "            stock: r.active === false ? 0 : typeof r.stock === \"number\" ? r.stock : 0,",
     "            isUnique: r.is_unique === true,",
     "            pieceState: pieceKnown ? pieceMap.get(p.id) || null : p.pieceState,",
     "          };",
     "        })",
     "      );",
     "    });",
     "    return () => {",
     "      alive = false;",
     "    };",
     "    // eslint-disable-next-line react-hooks/exhaustive-deps",
     "  }, [cartOpen]);"
    ]
   },
   {
    "name": "I10 ajout au panier : disponibilite et stock",
    "find": [
     "const current = cartItems.find((i) => i.id === p.id);",
     "setCheckoutNotice(false);",
     "if (current && current.qty >= MAX_QTY_PER_PRODUCT) {",
     "setCartNotice(`Quantité maximale atteinte pour « ${p.name} ».`);",
     "setCartOpen(true);",
     "return;",
     "}"
    ],
    "replace": [
     "const current = cartItems.find((i) => i.id === p.id);",
     "    setCheckoutNotice(false);",
     "    if (!getAvailability(p).orderable) {",
     "      setCartNotice(p.isUnique === true ? `« ${p.name} » n'est plus disponible.` : `« ${p.name} » est épuisée pour le moment.`);",
     "      setCartOpen(true);",
     "      return;",
     "    }",
     "    if (current && current.qty >= maxQtyFor(p)) {",
     "      setCartNotice(p.isUnique === true ? `« ${p.name} » est une pièce unique : un seul exemplaire possible.` : `Il ne reste pas d'autre exemplaire de « ${p.name} ».`);",
     "      setCartOpen(true);",
     "      return;",
     "    }"
    ]
   },
   {
    "name": "I11 changement de quantite : stock au lieu de 10",
    "find": [
     "if (delta > 0 && current.qty >= MAX_QTY_PER_PRODUCT) {",
     "setCartNotice(`Quantité maximale atteinte pour « ${p.name} ».`);",
     "return;",
     "}",
     "setCartNotice(\"\");",
     "setCartItems(",
     "cartItems.map((i) => (i.id === p.id ? { ...i, qty: Math.min(MAX_QTY_PER_PRODUCT, Math.max(1, i.qty + delta)) } : i))",
     ");"
    ],
    "replace": [
     "if (delta > 0 && current.qty >= maxQtyFor(p)) {",
     "      setCartNotice(`Il ne reste pas d'autre exemplaire de « ${p.name} ».`);",
     "      return;",
     "    }",
     "    setCartNotice(\"\");",
     "    setCartItems(",
     "      cartItems.map((i) => (i.id === p.id ? { ...i, qty: Math.max(1, i.qty + delta) } : i))",
     "    );"
    ]
   },
   {
    "name": "I12 carte du catalogue : « Écrivez-nous » si bijou normal epuise",
    "find": [
     "<Button onClick={() => addToCart(p)} variant=\"outline\" className=\"w-full mt-5 rounded-full border-[#b88d9f] hover:bg-[#8f6075] hover:text-white\">",
     "Ajouter au panier",
     "</Button>"
    ],
    "replace": [
     "{p.isUnique !== true && !getAvailability(p).orderable ? (",
     "                        <CatalogWriteUs product={p} contactSettings={contactSettings} />",
     "                      ) : (",
     "                        <Button onClick={() => addToCart(p)} variant=\"outline\" className=\"w-full mt-5 rounded-full border-[#b88d9f] hover:bg-[#8f6075] hover:text-white\">",
     "                          Ajouter au panier",
     "                        </Button>",
     "                      )}"
    ]
   },
   {
    "name": "I13 ligne du panier : messages valides",
    "find": [
     "{cartDensity === \"comfort\" && (",
     "<div className=\"mt-1.5\">",
     "<AvailabilityBadge product={p} qty={qty} showDetail />",
     "</div>",
     ")}",
     "{cartDensity !== \"comfort\" && avail.state !== \"in-stock\" && (",
     "<div className=\"text-[11px] text-amber-700 mt-1\">{avail.detail}</div>",
     ")}"
    ],
    "replace": [
     "{avail.state === \"in-stock\" ? (",
     "                              cartDensity === \"comfort\" ? (",
     "                                <div className=\"mt-1.5\">",
     "                                  <AvailabilityBadge product={p} qty={qty} />",
     "                                </div>",
     "                              ) : null",
     "                            ) : (",
     "                              <CartLineNotice product={p} state={avail.state} contactSettings={contactSettings} />",
     "                            )}"
    ]
   },
   {
    "name": "I14 bouton Commander bloque si le panier doit etre corrige",
    "find": [
     "disabled={shopPaused || checkoutLoading || !paymentMethod || (paymentMethod === \"card\" && !cgvAccepted) || !paymentMethodsLoaded || (!paymentMethodsCfg.stripe_enabled && !paymentMethodsCfg.transfer_enabled)}"
    ],
    "replace": [
     "disabled={shopPaused || checkoutLoading || cartBlocked || !paymentMethod || (paymentMethod === \"card\" && !cgvAccepted) || !paymentMethodsLoaded || (!paymentMethodsCfg.stripe_enabled && !paymentMethodsCfg.transfer_enabled)}"
    ]
   },
   {
    "name": "I15 fiche : encart piece unique a trois etats + contact",
    "find": [
     "uniqueNotice={<UniqueNotice product={selected} contactSettings={contactSettings} />}"
    ],
    "replace": [
     "uniqueNotice={<PieceUniqueNotice product={selected} contactSettings={contactSettings} />}",
     "        contactSettings={contactSettings}"
    ]
   }
  ],
  "finals": [
   "ZENORIA_STOCK_UI2_V1",
   "maxQtyFor(p)",
   "cartBlocked",
   "CartLineNotice",
   "CatalogWriteUs",
   "public_piece_states"
  ],
  "forbidden": [
   "MAX_QTY_PER_PRODUCT",
   "<UniqueNotice product"
  ]
 },
 {
  "path": "lib/quizState.js",
  "patches": [
   {
    "name": "Z1 borne technique (la vraie limite est le stock)",
    "find": [
     "export const MAX_QTY_PER_PRODUCT = 10;"
    ],
    "replace": [
     "export const MAX_QTY_PER_PRODUCT = 99; // ZENORIA_STOCK_UI2_V1 : borne technique seulement ; la vraie limite (stock) est transmise par pages/quiz.js"
    ]
   },
   {
    "name": "Z2 limite transmise par l'appelant",
    "find": [
     "export function addToStoredCart(storage, productId) {"
    ],
    "replace": [
     "export function addToStoredCart(storage, productId, maxQty = MAX_QTY_PER_PRODUCT) {"
    ]
   },
   {
    "name": "Z3 controle de la limite",
    "find": [
     "if (current && current.qty >= MAX_QTY_PER_PRODUCT) return { ok: false, reason: \"max\" };"
    ],
    "replace": [
     "if (current && current.qty >= maxQty) return { ok: false, reason: \"max\" };"
    ]
   }
  ],
  "finals": [
   "ZENORIA_STOCK_UI2_V1",
   "maxQty = MAX_QTY_PER_PRODUCT"
  ],
  "forbidden": [
   "MAX_QTY_PER_PRODUCT = 10;"
  ]
 },
 {
  "path": "pages/quiz.js",
  "patches": [
   {
    "name": "Q1 imports",
    "find": [
     "import ProductSheet from \"@/components/ProductSheet\";"
    ],
    "replace": [
     "import ProductSheet from \"@/components/ProductSheet\";",
     "import { PieceUniqueNotice } from \"@/components/ProductParts\"; // ZENORIA_STOCK_UI2_V1",
     "import { getAvailability, pieceStateMap, maxQtyFor } from \"@/lib/shopUtils\";",
     "import { CONTACT_KEY, DEFAULT_CONTACT, parseContactSetting } from \"@/lib/contactSettings\";",
     "import { SITE_SETTINGS_TABLE } from \"@/lib/siteSettings\";"
    ]
   },
   {
    "name": "Q2 canaux de contact",
    "find": [
     "const [cartAsk, setCartAsk] = useState(false); // la question « revenir au quiz après le panier ? »"
    ],
    "replace": [
     "const [cartAsk, setCartAsk] = useState(false); // la question « revenir au quiz après le panier ? »",
     "  const [contactSettings, setContactSettings] = useState(DEFAULT_CONTACT); // ZENORIA_STOCK_UI2_V1 : lien « Écrivez-nous » de la fiche"
    ]
   },
   {
    "name": "Q3 lecture des pieces et du contact",
    "find": [
     "const [prodRes, famRes, banRes, promoRes] = await Promise.all(["
    ],
    "replace": [
     "const [prodRes, famRes, banRes, promoRes, pieceRes, contactRes] = await Promise.all(["
    ]
   },
   {
    "name": "Q4 requetes",
    "find": [
     "optionalQuery(supabase.from(\"promo_codes\").select(\"code\").eq(\"active\", true)),"
    ],
    "replace": [
     "optionalQuery(supabase.from(\"promo_codes\").select(\"code\").eq(\"active\", true)),",
     "        optionalQuery(supabase.rpc(\"public_piece_states\")),",
     "        optionalQuery(supabase.from(SITE_SETTINGS_TABLE).select(\"value\").eq(\"key\", CONTACT_KEY).maybeSingle()),"
    ]
   },
   {
    "name": "Q5 produits enrichis + contact",
    "find": [
     "const { products, collections } = mapCatalog(prodRes && Array.isArray(prodRes.data) ? prodRes.data : [], families);",
     "setCatalog({ loading: false, products, collections, families });"
    ],
    "replace": [
     "const { products: rawProducts, collections } = mapCatalog(prodRes && Array.isArray(prodRes.data) ? prodRes.data : [], families);",
     "      const pieceMap = pieceStateMap(pieceRes && !pieceRes.error ? pieceRes.data : null);",
     "      const products = rawProducts.map((p) => ({ ...p, pieceState: pieceMap.get(p.id) || null }));",
     "      setCatalog({ loading: false, products, collections, families });",
     "      setContactSettings(parseContactSetting(contactRes && !contactRes.error && contactRes.data ? contactRes.data.value : null));"
    ]
   },
   {
    "name": "Q6 ajout au panier : disponibilite et stock",
    "find": [
     "const storage = getLocalStorage();",
     "const r = addToStoredCart(storage, product.id);"
    ],
    "replace": [
     "const storage = getLocalStorage();",
     "    if (!getAvailability(product).orderable) {",
     "      setToast({ kind: \"warn\", text: product.isUnique === true ? `« ${product.name} » n'est plus disponible.` : `« ${product.name} » est épuisée pour le moment.` });",
     "      return;",
     "    }",
     "    const r = addToStoredCart(storage, product.id, maxQtyFor(product));"
    ]
   },
   {
    "name": "Q7 message de quantite",
    "find": [
     "setToast({ kind: \"warn\", text: `Quantité maximale atteinte pour « ${product.name} ».` });"
    ],
    "replace": [
     "setToast({ kind: \"warn\", text: product.isUnique === true ? `« ${product.name} » est une pièce unique : un seul exemplaire possible.` : `Il ne reste pas d'autre exemplaire de « ${product.name} ».` });"
    ]
   },
   {
    "name": "Q8 fiche : encart piece unique + contact",
    "find": [
     "product={sheet ? sheet.product : null}"
    ],
    "replace": [
     "product={sheet ? sheet.product : null}",
     "        contactSettings={contactSettings}",
     "        uniqueNotice={sheet ? <PieceUniqueNotice product={sheet.product} contactSettings={contactSettings} /> : null}"
    ]
   }
  ],
  "finals": [
   "ZENORIA_STOCK_UI2_V1",
   "maxQtyFor(product)",
   "public_piece_states",
   "PieceUniqueNotice",
   "un seul exemplaire possible"
  ],
  "forbidden": [
   "Quantité maximale atteinte"
  ]
 },
 {
  "path": "pages/compte.js",
  "patches": [
   {
    "name": "C0 commentaire d'en-tete",
    "find": [
     "//  - CART_STORAGE_KEY et MAX_QTY_PER_PRODUCT restent dupliqués depuis pages/index.js (voir étape 1.3) ;"
    ],
    "replace": [
     "//  - CART_STORAGE_KEY reste dupliqué depuis pages/index.js (voir étape 1.3) ; plus de plafond fixe de quantité (lot 2c, stock) ;"
    ]
   },
   {
    "name": "C1 plus de plafond de 10",
    "find": [
     "const MAX_QTY_PER_PRODUCT = 10; // doit rester identique à pages/index.js"
    ],
    "replace": [
     "// ZENORIA_STOCK_UI2_V1 : plus de plafond fixe ; la quantité est contrôlée par le stock à l'ouverture du panier (pages/index.js)"
    ]
   },
   {
    "name": "C2 favoris : stock et piece unique lus",
    "find": [
     "const prodRes = await supabase.from(\"products\").select(\"id, slug, name, price, promo_price, photos, active\").in(\"id\", ids);"
    ],
    "replace": [
     "const prodRes = await supabase.from(\"products\").select(\"id, slug, name, price, promo_price, photos, active, stock, is_unique\").in(\"id\", ids);"
    ]
   },
   {
    "name": "C3 quantite ajoutee",
    "find": [
     "const qty = Math.min(MAX_QTY_PER_PRODUCT, (existing ? existing.qty : 0) + 1);"
    ],
    "replace": [
     "const qty = p.is_unique === true ? 1 : (existing ? existing.qty : 0) + 1;"
    ]
   },
   {
    "name": "C4 bouton : « Épuisé » si bijou normal sans stock",
    "find": [
     "<button type=\"button\" onClick={() => addFavoriteToCart(p)} disabled={!p.active} className=\"rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-3 py-1 text-xs disabled:opacity-50\">",
     "{p.active ? \"Ajouter au panier\" : \"Plus en vente\"}",
     "</button>"
    ],
    "replace": [
     "<button type=\"button\" onClick={() => addFavoriteToCart(p)} disabled={!p.active || (p.is_unique !== true && !(Number(p.stock) > 0))} className=\"rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-3 py-1 text-xs disabled:opacity-50\">",
     "                                {!p.active ? \"Plus en vente\" : p.is_unique !== true && !(Number(p.stock) > 0) ? \"Épuisé\" : \"Ajouter au panier\"}",
     "                              </button>"
    ]
   }
  ],
  "finals": [
   "ZENORIA_STOCK_UI2_V1",
   "stock, is_unique"
  ],
  "forbidden": [
   "MAX_QTY_PER_PRODUCT"
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
  if (content.includes(MARKER)) fail(f.path + " : le patch est deja applique (marqueur " + MARKER + " present).");
  if ((f.path === "lib/shopUtils.js" || f.path === "components/ProductParts.js") && !content.includes("ZENORIA_STOCK_UI_V1")) fail(f.path + " : le patch 2c-1 n'est pas applique (appliquez d'abord patch-lot2c1-affichage.mjs).");
  const before = problems.length;
  for (const p of f.patches) { const c = (content.match(toRegex(p.find)) || []).length; console.log((c === 1 ? "  OK  " : " ERREUR ") + p.name + " : " + c + " occurrence(s)"); if (c !== 1) problems.push(f.path + " : " + p.name + " (" + c + " occurrence(s) au lieu de 1)"); }
  if (problems.length === before) for (const p of f.patches) content = content.replace(toRegex(p.find), () => p.replace.join("\n"));
  results.push({ f, content, crlf });
}
if (problems.length) fail("verifier :\n  - " + problems.join("\n  - "));
for (const r of results) {
  for (const n of r.f.finals) if (!r.content.includes(n)) fail("controle final " + r.f.path + " : « " + n + " » absent apres patch.");
  for (const b of r.f.forbidden) if (r.content.includes(b)) fail("controle final " + r.f.path + " : « " + b + " » encore present apres patch.");
}
if (mode === "dry") { console.log("\nDRY-RUN termine : les " + FILES.length + " fichiers sont conformes. Rien n'a ete ecrit."); process.exit(0); }
for (const r of results) fs.writeFileSync(r.f.path, r.crlf ? r.content.replace(/\n/g, "\r\n") : r.content, "utf8");
console.log("\nPATCH APPLIQUE : " + results.length + " fichiers modifies.");
console.log("Retour arriere avant commit : git restore lib/shopUtils.js components/ProductParts.js pages/index.js pages/quiz.js lib/quizState.js pages/compte.js");
