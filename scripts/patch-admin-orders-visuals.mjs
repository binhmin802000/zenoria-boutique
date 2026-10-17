// scripts/patch-admin-orders-visuals.mjs
//
// Ameliorations visuelles du detail d'une commande, dans AdminOrders
// (components/AdminCrm.js) :
//
//   1. Vignette photo pour chaque article (reprend la meme logique que
//      CartThumb dans pages/index.js : getMediaUrl(photos[0], slug), avec
//      repli sur un degrade color/stone si pas de photo, et sur un petit
//      cadre neutre si le produit a ete supprime depuis - product_id
//      passe alors a NULL via ON DELETE SET NULL).
//   2. "Livraison" renomme en "Adresse de livraison".
//   3. La frise verticale du parcours est remplacee par une barre
//      horizontale : points relies par un trait, mauve plein pour les
//      etapes atteintes (avec leur date), gris clair pour celles a venir.
//
// Necessite de charger la table products (id, photos, slug, color, stone)
// en plus de orders/order_items/order_status_history deja charges.
//
// Garanties : verifie TOUS les reperes avant d'ecrire quoi que ce soit ;
// n'ecrit rien si un seul manque ; liste tous les reperes manquants ;
// conserve les fins de ligne du fichier ; peut etre relance sans effet.
//
// Usage : node scripts/patch-admin-orders-visuals.mjs

import fs from "node:fs";
import path from "node:path";

const filePath = path.join("components", "AdminCrm.js");

if (!fs.existsSync(filePath)) {
  console.error(`✗ Fichier introuvable : ${filePath}`);
  console.error("Lancez cette commande depuis le dossier « zenoria ».");
  process.exit(1);
}

const raw = fs.readFileSync(filePath, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";

if (raw.includes("OrderItemThumb")) {
  console.log("✓ Rien à modifier : les améliorations visuelles sont déjà en place.");
  process.exit(0);
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

// ---------------------------------------------------------------------
// Repères (chacun doit apparaître EXACTEMENT une fois)
// ---------------------------------------------------------------------
const anchors = {};

anchors.supabaseImport = 'import { supabase } from "@/lib/supabase";';

anchors.loadFunction =
  "  const load = useCallback(async () => {" + eol +
  "    setLoading(true);" + eol +
  '    setError("");' + eol +
  "    const [" + eol +
  "      { data: ordersData, error: ordersErr }," + eol +
  "      { data: itemsData, error: itemsErr }," + eol +
  "      { data: historyData, error: historyErr }," + eol +
  "    ] = await Promise.all([" + eol +
  '      supabase.from("orders").select("*").order("created_at", { ascending: false }),' + eol +
  '      supabase.from("order_items").select("*"),' + eol +
  '      supabase.from("order_status_history").select("*").order("changed_at", { ascending: true }),' + eol +
  "    ]);" + eol +
  "    if (ordersErr) {" + eol +
  '      setError("Impossible de charger les commandes : " + ordersErr.message);' + eol +
  "      setOrders([]);" + eol +
  "    } else {" + eol +
  "      setOrders(ordersData || []);" + eol +
  "    }" + eol +
  "    if (!itemsErr) {" + eol +
  "      const grouped = {};" + eol +
  "      (itemsData || []).forEach((it) => {" + eol +
  "        if (!grouped[it.order_id]) grouped[it.order_id] = [];" + eol +
  "        grouped[it.order_id].push(it);" + eol +
  "      });" + eol +
  "      setItemsByOrder(grouped);" + eol +
  "    }" + eol +
  "    if (!historyErr) {" + eol +
  "      const groupedHistory = {};" + eol +
  "      (historyData || []).forEach((h) => {" + eol +
  "        if (!groupedHistory[h.order_id]) groupedHistory[h.order_id] = [];" + eol +
  "        groupedHistory[h.order_id].push(h);" + eol +
  "      });" + eol +
  "      setStatusHistoryByOrder(groupedHistory);" + eol +
  "    }" + eol +
  "    setLoading(false);" + eol +
  "  }, []);";

anchors.statusHistoryState = "  const [statusHistoryByOrder, setStatusHistoryByOrder] = useState({});";

anchors.articlesBlock =
  '                        <div>' + eol +
  '                          <div className="text-xs font-medium text-[#8b737e] mb-1.5">Articles</div>' + eol +
  '                          <ul className="space-y-1 text-[13px] text-[#54434c]">' + eol +
  "                            {(itemsByOrder[o.id] || []).map((it) => (" + eol +
  '                              <li key={it.id} className="flex justify-between">' + eol +
  "                                <span>{it.qty} × {it.product_name}</span>" + eol +
  "                                <span>{formatOrderPrice(it.product_price * it.qty)}</span>" + eol +
  "                              </li>" + eol +
  "                            ))}" + eol +
  "                            {(itemsByOrder[o.id] || []).length === 0 && (" + eol +
  '                              <li className="text-[#8b737e]">Aucun article enregistré.</li>' + eol +
  "                            )}" + eol +
  "                          </ul>" + eol +
  "                        </div>";

anchors.livraisonLabel =
  '                          <div className="text-xs font-medium text-[#8b737e] mb-1.5">Livraison</div>';

anchors.timelineBlock =
  '                      <div className="mb-4">' + eol +
  '                        <div className="text-xs font-medium text-[#8b737e] mb-2">Parcours de la commande</div>' + eol +
  '                        <ol className="space-y-2">' + eol +
  '                          <li className="flex items-start gap-2 text-[13px]">' + eol +
  '                            <span className="mt-0.5 h-2 w-2 rounded-full bg-[#8f6075] shrink-0" />' + eol +
  "                            <span><strong>Panier validé</strong> — {formatDateTime(o.created_at)}</span>" + eol +
  "                          </li>" + eol +
  "                          {o.paid_at && (" + eol +
  '                            <li className="flex items-start gap-2 text-[13px]">' + eol +
  '                              <span className="mt-0.5 h-2 w-2 rounded-full bg-[#8f6075] shrink-0" />' + eol +
  "                              <span><strong>Paiement confirmé</strong> — {formatDateTime(o.paid_at)}</span>" + eol +
  "                            </li>" + eol +
  "                          )}" + eol +
  "                          {(statusHistoryByOrder[o.id] || [])" + eol +
  '                            .filter((h) => h.status !== "paid")' + eol +
  "                            .map((h) => (" + eol +
  '                              <li key={h.id} className="flex items-start gap-2 text-[13px]">' + eol +
  '                                <span className="mt-0.5 h-2 w-2 rounded-full bg-[#8f6075] shrink-0" />' + eol +
  "                                <span>{orderStatusBadge(h.status)} — {formatDateTime(h.changed_at)}{h.note ? ` · ${h.note}` : \"\"}</span>" + eol +
  "                              </li>" + eol +
  "                            ))}" + eol +
  '                          <li className="flex items-start gap-2 text-[13px] text-[#a79aa1]">' + eol +
  '                            <span className="mt-0.5 h-2 w-2 rounded-full border border-[#d9c5cc] shrink-0" />' + eol +
  "                            <span>Expédiée — en attente</span>" + eol +
  "                          </li>" + eol +
  '                          <li className="flex items-start gap-2 text-[13px] text-[#a79aa1]">' + eol +
  '                            <span className="mt-0.5 h-2 w-2 rounded-full border border-[#d9c5cc] shrink-0" />' + eol +
  "                            <span>Livrée — en attente</span>" + eol +
  "                          </li>" + eol +
  "                        </ol>" + eol +
  "                      </div>";

// ---------------------------------------------------------------------
// Vérification
// ---------------------------------------------------------------------
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
  console.error("\nVérifiez le contenu actuel de components/AdminCrm.js et collez-moi les lignes concernées.");
  process.exit(1);
}

// ---------------------------------------------------------------------
// Construction des remplacements
// ---------------------------------------------------------------------
let out = raw;

// 1) Import getMediaUrl, à côté de supabase
out = out.replace(
  anchors.supabaseImport,
  'import { supabase, getMediaUrl } from "@/lib/supabase";'
);

// 2) Nouvel état : produits par id (pour les photos)
out = out.replace(
  anchors.statusHistoryState,
  anchors.statusHistoryState + eol + "  const [productsById, setProductsById] = useState({});"
);

// 3) load() : charge aussi products (id, photos, slug, color, stone)
const newLoad =
  "  const load = useCallback(async () => {" + eol +
  "    setLoading(true);" + eol +
  '    setError("");' + eol +
  "    const [" + eol +
  "      { data: ordersData, error: ordersErr }," + eol +
  "      { data: itemsData, error: itemsErr }," + eol +
  "      { data: historyData, error: historyErr }," + eol +
  "      { data: productsData }," + eol +
  "    ] = await Promise.all([" + eol +
  '      supabase.from("orders").select("*").order("created_at", { ascending: false }),' + eol +
  '      supabase.from("order_items").select("*"),' + eol +
  '      supabase.from("order_status_history").select("*").order("changed_at", { ascending: true }),' + eol +
  '      supabase.from("products").select("id, photos, slug, color, stone"),' + eol +
  "    ]);" + eol +
  "    if (ordersErr) {" + eol +
  '      setError("Impossible de charger les commandes : " + ordersErr.message);' + eol +
  "      setOrders([]);" + eol +
  "    } else {" + eol +
  "      setOrders(ordersData || []);" + eol +
  "    }" + eol +
  "    if (!itemsErr) {" + eol +
  "      const grouped = {};" + eol +
  "      (itemsData || []).forEach((it) => {" + eol +
  "        if (!grouped[it.order_id]) grouped[it.order_id] = [];" + eol +
  "        grouped[it.order_id].push(it);" + eol +
  "      });" + eol +
  "      setItemsByOrder(grouped);" + eol +
  "    }" + eol +
  "    if (!historyErr) {" + eol +
  "      const groupedHistory = {};" + eol +
  "      (historyData || []).forEach((h) => {" + eol +
  "        if (!groupedHistory[h.order_id]) groupedHistory[h.order_id] = [];" + eol +
  "        groupedHistory[h.order_id].push(h);" + eol +
  "      });" + eol +
  "      setStatusHistoryByOrder(groupedHistory);" + eol +
  "    }" + eol +
  "    setProductsById(Object.fromEntries((productsData || []).map((p) => [p.id, p])));" + eol +
  "    setLoading(false);" + eol +
  "  }, []);";

out = out.replace(anchors.loadFunction, newLoad);

// 4) Bloc Articles : ajoute une vignette OrderItemThumb avant chaque nom
const newArticlesBlock =
  '                        <div>' + eol +
  '                          <div className="text-xs font-medium text-[#8b737e] mb-1.5">Articles</div>' + eol +
  '                          <ul className="space-y-2 text-[13px] text-[#54434c]">' + eol +
  "                            {(itemsByOrder[o.id] || []).map((it) => (" + eol +
  '                              <li key={it.id} className="flex items-center justify-between gap-2">' + eol +
  '                                <span className="flex items-center gap-2 min-w-0">' + eol +
  "                                  <OrderItemThumb product={productsById[it.product_id]} />" + eol +
  '                                  <span className="truncate">{it.qty} × {it.product_name}</span>' + eol +
  "                                </span>" + eol +
  '                                <span className="shrink-0">{formatOrderPrice(it.product_price * it.qty)}</span>' + eol +
  "                              </li>" + eol +
  "                            ))}" + eol +
  "                            {(itemsByOrder[o.id] || []).length === 0 && (" + eol +
  '                              <li className="text-[#8b737e]">Aucun article enregistré.</li>' + eol +
  "                            )}" + eol +
  "                          </ul>" + eol +
  "                        </div>";

out = out.replace(anchors.articlesBlock, newArticlesBlock);

// 5) "Livraison" -> "Adresse de livraison"
out = out.replace(
  anchors.livraisonLabel,
  '                          <div className="text-xs font-medium text-[#8b737e] mb-1.5">Adresse de livraison</div>'
);

// 6) Barre horizontale à la place de la frise verticale
const newTimelineBlock =
  '                      <div className="mb-4">' + eol +
  '                        <div className="text-xs font-medium text-[#8b737e] mb-3">Parcours de la commande</div>' + eol +
  "                        {(() => {" + eol +
  "                          const steps = [" + eol +
  '                            { label: "Panier validé", done: true, date: o.created_at },' + eol +
  '                            { label: "Paiement confirmé", done: Boolean(o.paid_at), date: o.paid_at },' + eol +
  '                            { label: "Expédiée", done: Boolean((statusHistoryByOrder[o.id] || []).find((h) => h.status === "shipped")), date: (statusHistoryByOrder[o.id] || []).find((h) => h.status === "shipped")?.changed_at },' + eol +
  '                            { label: "Livrée", done: Boolean((statusHistoryByOrder[o.id] || []).find((h) => h.status === "delivered")), date: (statusHistoryByOrder[o.id] || []).find((h) => h.status === "delivered")?.changed_at },' + eol +
  "                          ];" + eol +
  "                          return (" + eol +
  '                            <div className="flex items-start">' + eol +
  "                              {steps.map((step, i) => (" + eol +
  '                                <React.Fragment key={step.label}>' + eol +
  '                                  <div className="flex flex-col items-center text-center" style={{ minWidth: 92 }}>' + eol +
  '                                    <span className={`h-3 w-3 rounded-full shrink-0 ${step.done ? "bg-[#8f6075]" : "bg-[#eadfe4]"}`} />' + eol +
  '                                    <span className={`mt-1.5 text-[12px] leading-4 ${step.done ? "text-[#412f3b] font-medium" : "text-[#a79aa1]"}`}>{step.label}</span>' + eol +
  '                                    <span className="text-[10px] text-[#8b737e] leading-4">{step.done && step.date ? formatDateTime(step.date) : step.done ? "" : "En attente"}</span>' + eol +
  "                                  </div>" + eol +
  "                                  {i < steps.length - 1 && (" + eol +
  '                                    <div className={`h-[2px] flex-1 mt-1.5 ${steps[i + 1].done ? "bg-[#8f6075]" : "bg-[#eadfe4]"}`} />' + eol +
  "                                  )}" + eol +
  "                                </React.Fragment>" + eol +
  "                              ))}" + eol +
  "                            </div>" + eol +
  "                          );" + eol +
  "                        })()}" + eol +
  "                      </div>";

out = out.replace(anchors.timelineBlock, newTimelineBlock);

// 7) Composant OrderItemThumb, ajouté juste avant "export function AdminOrders() {"
const thumbComponent =
  "// Petite vignette d'un article de commande : reprend la meme logique que" + eol +
  "// CartThumb (pages/index.js) -- photo si disponible, degrade couleur/pierre" + eol +
  "// sinon, cadre neutre si le produit a ete supprime depuis (product_id est" + eol +
  "// alors NULL, product_name reste le seul renseignement disponible)." + eol +
  "function OrderItemThumb({ product }) {" + eol +
  "  const [imgError, setImgError] = useState(false);" + eol +
  "  if (!product) {" + eol +
  "    return <div className=\"h-8 w-8 shrink-0 rounded-lg bg-[#f5edf1]\" />;" + eol +
  "  }" + eol +
  "  const src = product.photos && product.photos[0] ? getMediaUrl(product.photos[0], product.slug) : null;" + eol +
  "  if (src && !imgError) {" + eol +
  "    return (" + eol +
  "      <div className=\"h-8 w-8 shrink-0 rounded-lg overflow-hidden bg-[#f5edf1]\">" + eol +
  "        {/* eslint-disable-next-line @next/next/no-img-element */}" + eol +
  "        <img src={src} alt=\"\" onError={() => setImgError(true)} className=\"w-full h-full object-cover object-center\" />" + eol +
  "      </div>" + eol +
  "    );" + eol +
  "  }" + eol +
  "  return (" + eol +
  "    <div className={`h-8 w-8 shrink-0 rounded-lg bg-gradient-to-br ${product.color || \"from-[#eadfe4] to-[#f5edf1]\"} grid place-items-center text-xs`}>" + eol +
  "      {product.stone || \"\"}" + eol +
  "    </div>" + eol +
  "  );" + eol +
  "}" + eol +
  eol;

out = out.replace("export function AdminOrders() {", thumbComponent + "export function AdminOrders() {");

// ---------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------
fs.writeFileSync(filePath, out, "utf8");

console.log(`✓ ${filePath} : améliorations visuelles appliquées`);
console.log("  • vignette photo pour chaque article (OrderItemThumb)");
console.log("  • « Livraison » renommé en « Adresse de livraison »");
console.log("  • frise verticale remplacée par une barre horizontale (points reliés, mauve = atteint, gris = en attente)");
console.log("\nTerminé.");
