// scripts/patch-admin-orders-phase1.mjs
//
// Phase 1 de la feuille de route "Commandes" (components/AdminCrm.js,
// composant AdminOrders) :
//
//   1. Reference lisible ZEN-AAAA-MMJJ-NNNN (affichage uniquement, aucune
//      nouvelle colonne : NNNN reste orders.id complete a 4 chiffres).
//   2. Filtre de periode : raccourcis (Aujourd'hui / 7 jours / 30 jours /
//      Tout) + deux calendriers pour une periode personnalisee. S'applique
//      aux cartes de statistiques ET au tableau.
//   3. Exclusion par defaut des donnees de test (is_test = true) des
//      statistiques, avec une case a cocher "Afficher aussi les donnees
//      de test". Bandeau d'avertissement dans le detail d'une commande de
//      test.
//   4. Frise du parcours de la commande (Panier valide, Paiement
//      confirme, puis les etapes de order_status_history, puis Expediee/
//      Livree "en attente" tant que la logistique n'existe pas).
//
// Prerequis : orders.is_test doit deja exister (supabase_orders_is_test.sql)
// et le webhook doit deja le renseigner (patch-webhook-is-test.mjs).
//
// Garanties : verifie TOUS les reperes avant d'ecrire quoi que ce soit ;
// n'ecrit rien si un seul manque ; liste tous les reperes manquants ;
// conserve les fins de ligne du fichier ; peut etre relance sans effet.
//
// Usage : node scripts/patch-admin-orders-phase1.mjs

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

if (raw.includes("formatOrderReference")) {
  console.log("✓ Rien à modifier : la Phase 1 (référence, filtre, frise) est déjà en place.");
  process.exit(0);
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

// ---------------------------------------------------------------------
// Repères, tous vérifiés AVANT toute écriture
// ---------------------------------------------------------------------
const anchors = {};

anchors.formatOrderPrice =
  "function formatOrderPrice(n) {" + eol +
  '  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(n) || 0);' + eol +
  "}";

anchors.openOrderIdState =
  "  const [openOrderId, setOpenOrderId] = useState(null);";

anchors.loadFunction =
  "  const load = useCallback(async () => {" + eol +
  "    setLoading(true);" + eol +
  '    setError("");' + eol +
  "    const [{ data: ordersData, error: ordersErr }, { data: itemsData, error: itemsErr }] = await Promise.all([" + eol +
  '      supabase.from("orders").select("*").order("created_at", { ascending: false }),' + eol +
  '      supabase.from("order_items").select("*"),' + eol +
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
  "    setLoading(false);" + eol +
  "  }, []);";

anchors.statsAndVisible =
  "  const stats = useMemo(() => {" + eol +
  '    const paid = orders.filter((o) => o.status === "paid" || o.status === "shipped");' + eol +
  "    const revenue = paid.reduce((s, o) => s + Number(o.total || 0), 0);" + eol +
  "    const monthAgo = Date.now() - 30 * 24 * 3600 * 1000;" + eol +
  "    const recent = orders.filter((o) => o.created_at && new Date(o.created_at).getTime() >= monthAgo).length;" + eol +
  "    return { total: orders.length, paid: paid.length, revenue, recent };" + eol +
  "  }, [orders]);" + eol +
  eol +
  "  const q = query.trim().toLowerCase();" + eol +
  "  const visible = orders.filter((o) => {" + eol +
  "    if (!q) return true;" + eol +
  '    const email = (o.guest_email || "").toLowerCase();' + eol +
  "    const ref = String(o.id);" + eol +
  "    return email.includes(q) || ref.includes(q);" + eol +
  "  });";

// Repère spécifique à AdminOrders (pas CrmAccounts, qui a aussi "const cards = [")
anchors.cardsStart =
  "    return email.includes(q) || ref.includes(q);" + eol +
  "  });" + eol +
  eol +
  "  const cards = [" + eol +
  '    { label: "Commandes totales", value: stats.total },';

anchors.filterRow =
  '      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-3">' + eol +
  "        <input" + eol +
  '          type="search"' + eol +
  "          value={query}" + eol +
  "          onChange={(e) => setQuery(e.target.value)}" + eol +
  '          placeholder="Rechercher par e-mail ou numéro de commande"' + eol +
  '          aria-label="Rechercher une commande"' + eol +
  '          data-testid="orders-search"' + eol +
  '          className="w-full sm:w-80 rounded-full border border-[#eadfe4] bg-white px-4 h-10 text-sm outline-none focus:border-[#8f6075]"' + eol +
  "        />" + eol +
  "      </div>";

anchors.referenceCell =
  '                  <td className="px-4 py-3 whitespace-nowrap text-[#54434c]">#{o.id}</td>';

anchors.detailStart =
  '                    <td colSpan={6} className="px-4 py-4">' + eol +
  '                      <div className="grid md:grid-cols-2 gap-4">';

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

// 1) Fonction de référence, juste après formatOrderPrice
const referenceFunction =
  eol + eol +
  "// Référence lisible : ZEN-AAAA-MMJJ-NNNN (année, mois+jour de la commande, puis" + eol +
  "// l'identifiant de la commande complété à 4 chiffres). Purement un formatage" + eol +
  "// d'affichage : la vraie clé reste orders.id, aucune nouvelle colonne nécessaire." + eol +
  "function formatOrderReference(order) {" + eol +
  "  const d = order.created_at ? new Date(order.created_at) : null;" + eol +
  '  const counter = String(order.id).padStart(4, "0");' + eol +
  '  if (!d) return `ZEN-${counter}`;' + eol +
  "  const year = d.getFullYear();" + eol +
  '  const month = String(d.getMonth() + 1).padStart(2, "0");' + eol +
  '  const day = String(d.getDate()).padStart(2, "0");' + eol +
  "  return `ZEN-${year}-${month}${day}-${counter}`;" + eol +
  "}";

out = out.replace(anchors.formatOrderPrice, anchors.formatOrderPrice + referenceFunction);

// 2) Nouveaux états, juste après openOrderId
const newStates =
  eol +
  "  const [statusHistoryByOrder, setStatusHistoryByOrder] = useState({});" + eol +
  '  const [datePreset, setDatePreset] = useState("all"); // "today" | "7d" | "30d" | "custom" | "all"' + eol +
  '  const [dateFrom, setDateFrom] = useState("");' + eol +
  '  const [dateTo, setDateTo] = useState("");' + eol +
  "  const [includeTestData, setIncludeTestData] = useState(false);";

out = out.replace(anchors.openOrderIdState, anchors.openOrderIdState + newStates);

// 3) load() : ajoute la lecture de order_status_history
const newLoad =
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

out = out.replace(anchors.loadFunction, newLoad);

// 4) stats + visible : filtrage par période et données de test
const newStatsAndVisible =
  "  const filteredOrders = useMemo(() => {" + eol +
  "    return orders.filter((o) => {" + eol +
  "      if (!includeTestData && o.is_test) return false;" + eol +
  "      if (dateFrom) {" + eol +
  '        const from = new Date(dateFrom + "T00:00:00");' + eol +
  "        if (!o.created_at || new Date(o.created_at) < from) return false;" + eol +
  "      }" + eol +
  "      if (dateTo) {" + eol +
  '        const to = new Date(dateTo + "T23:59:59");' + eol +
  "        if (!o.created_at || new Date(o.created_at) > to) return false;" + eol +
  "      }" + eol +
  "      return true;" + eol +
  "    });" + eol +
  "  }, [orders, includeTestData, dateFrom, dateTo]);" + eol +
  eol +
  "  const stats = useMemo(() => {" + eol +
  '    const paid = filteredOrders.filter((o) => o.status === "paid" || o.status === "shipped");' + eol +
  "    const revenue = paid.reduce((s, o) => s + Number(o.total || 0), 0);" + eol +
  "    const monthAgo = Date.now() - 30 * 24 * 3600 * 1000;" + eol +
  "    const recent = filteredOrders.filter((o) => o.created_at && new Date(o.created_at).getTime() >= monthAgo).length;" + eol +
  "    return { total: filteredOrders.length, paid: paid.length, revenue, recent };" + eol +
  "  }, [filteredOrders]);" + eol +
  eol +
  "  const q = query.trim().toLowerCase();" + eol +
  "  const visible = filteredOrders.filter((o) => {" + eol +
  "    if (!q) return true;" + eol +
  '    const email = (o.guest_email || "").toLowerCase();' + eol +
  "    const ref = String(o.id);" + eol +
  "    const reference = formatOrderReference(o).toLowerCase();" + eol +
  '    return email.includes(q) || ref.includes(q) || reference.includes(q.replace(/\\s+/g, ""));' + eol +
  "  });" + eol +
  eol +
  "  const setPreset = (preset) => {" + eol +
  "    setDatePreset(preset);" + eol +
  '    const toIso = (d) => d.toISOString().slice(0, 10);' + eol +
  "    const now = new Date();" + eol +
  '    if (preset === "today") {' + eol +
  "      const today = toIso(now);" + eol +
  "      setDateFrom(today);" + eol +
  "      setDateTo(today);" + eol +
  '    } else if (preset === "7d") {' + eol +
  "      const from = new Date(now.getTime() - 6 * 24 * 3600 * 1000);" + eol +
  "      setDateFrom(toIso(from));" + eol +
  "      setDateTo(toIso(now));" + eol +
  '    } else if (preset === "30d") {' + eol +
  "      const from = new Date(now.getTime() - 29 * 24 * 3600 * 1000);" + eol +
  "      setDateFrom(toIso(from));" + eol +
  "      setDateTo(toIso(now));" + eol +
  "    } else {" + eol +
  '      setDateFrom("");' + eol +
  '      setDateTo("");' + eol +
  "    }" + eol +
  "  };";

out = out.replace(anchors.statsAndVisible, newStatsAndVisible);

// 5) cards[0] inchangé mais sert d'ancre unique désormais : rien à faire
// ici, le bloc est déjà correct dans le fichier d'origine une fois le
// repère localisé sans ambiguïté.

// 6) Ligne de filtre (presets + calendriers + checkbox + recherche)
const newFilterRow =
  '      <div className="flex flex-wrap items-center gap-2 mb-3">' + eol +
  '        <button type="button" onClick={() => setPreset("today")} data-testid="date-preset-today" className={`rounded-full px-3 h-8 text-xs border transition ${datePreset === "today" ? "bg-[#8f6075] text-white border-[#8f6075]" : "border-[#d9c5cc] text-[#54434c] hover:bg-[#f5edf1]"}`}>' + eol +
  "          Aujourd'hui" + eol +
  "        </button>" + eol +
  '        <button type="button" onClick={() => setPreset("7d")} data-testid="date-preset-7d" className={`rounded-full px-3 h-8 text-xs border transition ${datePreset === "7d" ? "bg-[#8f6075] text-white border-[#8f6075]" : "border-[#d9c5cc] text-[#54434c] hover:bg-[#f5edf1]"}`}>' + eol +
  "          7 jours" + eol +
  "        </button>" + eol +
  '        <button type="button" onClick={() => setPreset("30d")} data-testid="date-preset-30d" className={`rounded-full px-3 h-8 text-xs border transition ${datePreset === "30d" ? "bg-[#8f6075] text-white border-[#8f6075]" : "border-[#d9c5cc] text-[#54434c] hover:bg-[#f5edf1]"}`}>' + eol +
  "          30 jours" + eol +
  "        </button>" + eol +
  '        <button type="button" onClick={() => setPreset("all")} data-testid="date-preset-all" className={`rounded-full px-3 h-8 text-xs border transition ${datePreset === "all" ? "bg-[#8f6075] text-white border-[#8f6075]" : "border-[#d9c5cc] text-[#54434c] hover:bg-[#f5edf1]"}`}>' + eol +
  "          Tout" + eol +
  "        </button>" + eol +
  '        <span className="text-[#d9c5cc]">|</span>' + eol +
  "        <input" + eol +
  '          type="date"' + eol +
  "          value={dateFrom}" + eol +
  '          onChange={(e) => { setDatePreset("custom"); setDateFrom(e.target.value); }}' + eol +
  '          data-testid="date-from"' + eol +
  '          aria-label="Date de début"' + eol +
  '          className="rounded-full border border-[#eadfe4] bg-white px-3 h-8 text-xs outline-none focus:border-[#8f6075]"' + eol +
  "        />" + eol +
  '        <span className="text-[#8b737e] text-xs">au</span>' + eol +
  "        <input" + eol +
  '          type="date"' + eol +
  "          value={dateTo}" + eol +
  '          onChange={(e) => { setDatePreset("custom"); setDateTo(e.target.value); }}' + eol +
  '          data-testid="date-to"' + eol +
  '          aria-label="Date de fin"' + eol +
  '          className="rounded-full border border-[#eadfe4] bg-white px-3 h-8 text-xs outline-none focus:border-[#8f6075]"' + eol +
  "        />" + eol +
  "      </div>" + eol +
  eol +
  '      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-3">' + eol +
  "        <input" + eol +
  '          type="search"' + eol +
  "          value={query}" + eol +
  "          onChange={(e) => setQuery(e.target.value)}" + eol +
  '          placeholder="Rechercher par référence, e-mail ou numéro de commande"' + eol +
  '          aria-label="Rechercher une commande"' + eol +
  '          data-testid="orders-search"' + eol +
  '          className="w-full sm:w-80 rounded-full border border-[#eadfe4] bg-white px-4 h-10 text-sm outline-none focus:border-[#8f6075]"' + eol +
  "        />" + eol +
  '        <label className="flex items-center gap-2 text-sm text-[#54434c]">' + eol +
  '          <input type="checkbox" checked={includeTestData} onChange={(e) => setIncludeTestData(e.target.checked)} data-testid="orders-include-test" className="h-4 w-4" />' + eol +
  "          Afficher aussi les données de test" + eol +
  "        </label>" + eol +
  "      </div>";

out = out.replace(anchors.filterRow, newFilterRow);

// 7) Référence + badge TEST dans la cellule du tableau
const newReferenceCell =
  '                  <td className="px-4 py-3 whitespace-nowrap text-[#54434c]">' + eol +
  "                    {formatOrderReference(o)}" + eol +
  '                    {o.is_test && <span className="ml-1.5 rounded-full bg-amber-50 text-amber-700 px-1.5 py-0.5 text-[10px] align-middle">TEST</span>}' + eol +
  "                  </td>";

out = out.replace(anchors.referenceCell, newReferenceCell);

// 8) Bandeau "données de test" + frise du parcours, dans le détail
const newDetailStart =
  '                    <td colSpan={6} className="px-4 py-4">' + eol +
  "                      {o.is_test && (" + eol +
  '                        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[12px] px-3 py-2">' + eol +
  "                          Donnée de test : cette commande a été passée en mode test Stripe. Elle n&apos;est pas prise en compte dans les statistiques de production." + eol +
  "                        </div>" + eol +
  "                      )}" + eol +
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
  "                      </div>" + eol +
  '                      <div className="grid md:grid-cols-2 gap-4">';

out = out.replace(anchors.detailStart, newDetailStart);

// ---------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------
fs.writeFileSync(filePath, out, "utf8");

console.log(`✓ ${filePath} : Phase 1 appliquée`);
console.log("  • référence ZEN-AAAA-MMJJ-NNNN (+ badge TEST si is_test)");
console.log("  • filtre de période (raccourcis + 2 calendriers), appliqué aux stats et au tableau");
console.log("  • case « Afficher aussi les données de test », exclues par défaut des statistiques");
console.log("  • bandeau d'avertissement sur une commande de test");
console.log("  • frise du parcours de la commande (panier validé, paiement confirmé, historique, expédiée/livrée en attente)");
console.log("\nTerminé.");
