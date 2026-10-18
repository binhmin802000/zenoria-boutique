// scripts/patch-admin-shipping.mjs
//
// Phase 3 (logistique manuelle) : ajoute dans AdminOrders (components/AdminCrm.js) :
//   1. Le statut "delivered" dans ORDER_STATUS_LABELS (badge "Livrée").
//   2. Un bloc "Expédition" dans le detail d'une commande (juste apres la
//      frise horizontale, avant Articles/Adresse) : selecteur de
//      transporteur, champ numero de suivi, deux boutons ("Marquer comme
//      expediee" / "Marquer comme livree"), relies a la nouvelle route
//      pages/api/admin/orders/update-status.js.
//
// Garanties : verifie TOUS les reperes avant d'ecrire quoi que ce soit ;
// n'ecrit rien si un seul manque ; liste tous les reperes manquants ;
// conserve les fins de ligne du fichier ; peut etre relance sans effet.
//
// Usage : node scripts/patch-admin-shipping.mjs

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

if (raw.includes("ShippingPanel")) {
  console.log("✓ Rien à modifier : le bloc Expédition est déjà en place.");
  process.exit(0);
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

const anchors = {};

anchors.statusLabels =
  "const ORDER_STATUS_LABELS = {" + eol +
  '  pending: { label: "En attente", className: "bg-amber-50 text-amber-700" },' + eol +
  '  paid: { label: "Payée", className: "bg-emerald-50 text-emerald-700" },' + eol +
  '  shipped: { label: "Expédiée", className: "bg-sky-50 text-sky-700" },' + eol +
  '  cancelled: { label: "Annulée", className: "bg-red-50 text-red-700" },' + eol +
  '  refunded: { label: "Remboursée", className: "bg-[#f5edf1] text-[#8f6075]" },' + eol +
  '  expired: { label: "Expirée", className: "bg-gray-100 text-gray-500" },' + eol +
  "};";

anchors.openOrderIdState = "  const [openOrderId, setOpenOrderId] = useState(null);";

anchors.timelineToGrid =
  "                        })()}" + eol +
  "                      </div>" + eol +
  '                      <div className="grid md:grid-cols-2 gap-4">';

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

let out = raw;

// 1) Badge "Livrée"
out = out.replace(
  anchors.statusLabels,
  "const ORDER_STATUS_LABELS = {" + eol +
    '  pending: { label: "En attente", className: "bg-amber-50 text-amber-700" },' + eol +
    '  paid: { label: "Payée", className: "bg-emerald-50 text-emerald-700" },' + eol +
    '  shipped: { label: "Expédiée", className: "bg-sky-50 text-sky-700" },' + eol +
    '  delivered: { label: "Livrée", className: "bg-violet-50 text-violet-700" },' + eol +
    '  cancelled: { label: "Annulée", className: "bg-red-50 text-red-700" },' + eol +
    '  refunded: { label: "Remboursée", className: "bg-[#f5edf1] text-[#8f6075]" },' + eol +
    '  expired: { label: "Expirée", className: "bg-gray-100 text-gray-500" },' + eol +
    "};"
);

// 2) Nouveaux états (transporteur/suivi sélectionnés par commande, et état d'envoi en cours)
out = out.replace(
  anchors.openOrderIdState,
  anchors.openOrderIdState + eol +
    "  const [shippingDraft, setShippingDraft] = useState({});" + eol +
    "  const [shippingBusyId, setShippingBusyId] = useState(null);" + eol +
    '  const CARRIERS = ["Colissimo", "Mondial Relay", "Chronopost"];' + eol +
    eol +
    "  const updateOrderStatus = async (orderId, action, extra) => {" + eol +
    "    setShippingBusyId(orderId);" + eol +
    "    try {" + eol +
    '      const res = await fetch("/api/admin/orders/update-status", {' + eol +
    '        method: "POST",' + eol +
    '        headers: { "Content-Type": "application/json" },' + eol +
    "        body: JSON.stringify({ orderId, action, ...extra })," + eol +
    "      });" + eol +
    "      const data = await res.json();" + eol +
    "      if (!data.ok) {" + eol +
    '        setError((data && data.error) || "Échec de la mise à jour.");' + eol +
    "      } else {" + eol +
    "        await load();" + eol +
    "      }" + eol +
    "    } catch (e) {" + eol +
    '      setError("Impossible de contacter le serveur.");' + eol +
    "    } finally {" + eol +
    "      setShippingBusyId(null);" + eol +
    "    }" + eol +
    "  };"
);

// 3) Bloc "Expédition" inséré juste après la frise, avant le grid Articles/Adresse
const shippingPanel =
  "                        })()}" + eol +
  "                      </div>" + eol +
  eol +
  "                      {/* ShippingPanel : transporteur, numéro de suivi, actions d'expédition */}" + eol +
  '                      <div className="mb-4 rounded-xl bg-white border border-[#eee2e5] px-4 py-3.5">' + eol +
  '                        <div className="text-xs font-medium text-[#8b737e] mb-2.5">Expédition</div>' + eol +
  "                        {o.tracking_number ? (" + eol +
  '                          <p className="text-[13px] text-[#54434c] leading-5 mb-2">' + eol +
  "                            {o.carrier} · Suivi : <strong>{o.tracking_number}</strong>" + eol +
  '                            {o.shipped_at && <span className="text-[#8b737e]"> · expédiée le {formatDateTime(o.shipped_at)}</span>}' + eol +
  "                          </p>" + eol +
  "                        ) : (" + eol +
  '                          <div className="flex flex-wrap items-center gap-2 mb-2.5">' + eol +
  "                            <select" + eol +
  "                              value={(shippingDraft[o.id] || {}).carrier || CARRIERS[0]}" + eol +
  "                              onChange={(e) => setShippingDraft((prev) => ({ ...prev, [o.id]: { ...prev[o.id], carrier: e.target.value } }))}" + eol +
  '                              data-testid="shipping-carrier"' + eol +
  '                              className="rounded-full border border-[#eadfe4] bg-white px-3 h-9 text-[13px] outline-none focus:border-[#8f6075]"' + eol +
  "                            >" + eol +
  "                              {CARRIERS.map((c) => (" + eol +
  "                                <option key={c} value={c}>{c}</option>" + eol +
  "                              ))}" + eol +
  "                            </select>" + eol +
  "                            <input" + eol +
  '                              type="text"' + eol +
  '                              placeholder="Numéro de suivi"' + eol +
  "                              value={(shippingDraft[o.id] || {}).trackingNumber || \"\"}" + eol +
  "                              onChange={(e) => setShippingDraft((prev) => ({ ...prev, [o.id]: { ...prev[o.id], trackingNumber: e.target.value } }))}" + eol +
  '                              data-testid="shipping-tracking-number"' + eol +
  '                              className="flex-1 min-w-[160px] rounded-full border border-[#eadfe4] bg-white px-3 h-9 text-[13px] outline-none focus:border-[#8f6075]"' + eol +
  "                            />" + eol +
  "                          </div>" + eol +
  "                        )}" + eol +
  '                        <div className="flex flex-wrap gap-2">' + eol +
  "                          <button" + eol +
  '                            type="button"' + eol +
  "                            disabled={shippingBusyId === o.id || Boolean(o.tracking_number)}" + eol +
  "                            onClick={() => {" + eol +
  "                              const draft = shippingDraft[o.id] || {};" + eol +
  "                              updateOrderStatus(o.id, \"ship\", {" + eol +
  "                                carrier: draft.carrier || CARRIERS[0]," + eol +
  '                                trackingNumber: draft.trackingNumber || "",' + eol +
  "                              });" + eol +
  "                            }}" + eol +
  '                            data-testid="mark-shipped"' + eol +
  '                            className="rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white text-xs font-medium px-4 h-9 transition disabled:opacity-50 disabled:cursor-not-allowed"' + eol +
  "                          >" + eol +
  "                            Marquer comme expédiée" + eol +
  "                          </button>" + eol +
  "                          <button" + eol +
  '                            type="button"' + eol +
  '                            disabled={shippingBusyId === o.id || o.status === "delivered"}' + eol +
  '                            onClick={() => updateOrderStatus(o.id, "deliver")}' + eol +
  '                            data-testid="mark-delivered"' + eol +
  '                            className="rounded-full border border-[#8f6075] text-[#8f6075] hover:bg-[#8f6075] hover:text-white text-xs font-medium px-4 h-9 transition disabled:opacity-50 disabled:cursor-not-allowed"' + eol +
  "                          >" + eol +
  "                            Marquer comme livrée" + eol +
  "                          </button>" + eol +
  "                        </div>" + eol +
  "                      </div>" + eol +
  eol +
  '                      <div className="grid md:grid-cols-2 gap-4">';

out = out.replace(anchors.timelineToGrid, shippingPanel);

fs.writeFileSync(filePath, out, "utf8");

console.log(`✓ ${filePath} : bloc Expédition ajouté`);
console.log("  • badge « Livrée » pour le statut delivered");
console.log("  • sélecteur transporteur + numéro de suivi");
console.log("  • boutons « Marquer comme expédiée » / « Marquer comme livrée »");
console.log("\nTerminé.");
