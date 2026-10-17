// scripts/add-admin-orders.mjs
//
// Ajoute un nouvel onglet « Commandes » dans le groupe CRM de l'admin.
//
// Ce script modifie TROIS fichiers :
//   1. lib/adminNav.js       -> ajoute l'entree { id: "commandes", label: "Commandes" }
//                                dans le groupe crm, juste apres "comptes".
//   2. pages/admin.js        -> ajoute l'icone ShoppingBag (deja disponible dans
//                                lucide-react), l'import de AdminOrders, et la ligne
//                                de rendu {tab === "commandes" && <AdminOrders />}.
//   3. components/AdminCrm.js -> ajoute le composant AdminOrders (lecture seule :
//                                aucune ecriture n'est possible depuis cet ecran,
//                                les commandes sont creees uniquement par le webhook
//                                Stripe) et retire de ROADMAP les deux entrees
//                                desormais realisables ("Adresses de livraison et de
//                                facturation", "Commandes et historique d'achat"),
//                                puisque le paiement et les tables de commandes
//                                existent desormais reellement.
//
// Garanties : verifie TOUS les reperes dans les TROIS fichiers avant d'ecrire quoi
// que ce soit ; n'ecrit rien si un seul manque ; liste tous les reperes manquants ;
// conserve les fins de ligne de chaque fichier ; peut etre relance sans effet.
//
// Usage : node scripts/add-admin-orders.mjs

import fs from "node:fs";
import path from "node:path";

const navPath = path.join("lib", "adminNav.js");
const adminPath = path.join("pages", "admin.js");
const crmPath = path.join("components", "AdminCrm.js");

for (const f of [navPath, adminPath, crmPath]) {
  if (!fs.existsSync(f)) {
    console.error(`✗ Fichier introuvable : ${f}`);
    console.error("Lancez cette commande depuis le dossier « zenoria ».");
    process.exit(1);
  }
}

function readFile(p) {
  const raw = fs.readFileSync(p, "utf8");
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  return { raw, eol };
}

const nav = readFile(navPath);
const admin = readFile(adminPath);
const crm = readFile(crmPath);

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

// ---------------------------------------------------------------------
// Idempotence globale
// ---------------------------------------------------------------------
const alreadyDone =
  nav.raw.includes('{ id: "commandes", label: "Commandes" }') &&
  admin.raw.includes("AdminOrders") &&
  crm.raw.includes("export function AdminOrders");

if (alreadyDone) {
  console.log("✓ Rien à modifier : l'onglet « Commandes » est déjà en place.");
  process.exit(0);
}

// ---------------------------------------------------------------------
// Repères (chacun doit apparaître EXACTEMENT une fois dans son fichier)
//
// IMPORTANT : dans les textes JSX (enfants directs de balises, hors chaînes
// JS), les apostrophes sont écrites "&apos;" dans ce projet (convention déjà
// en place pour éviter l'avertissement react/no-unescaped-entities). Les
// apostrophes à l'intérieur de chaînes JS (ex. tableaux de données) restent
// de vraies apostrophes, comme dans le reste du fichier.
// ---------------------------------------------------------------------
const anchors = {
  nav_crmGroup:
    '      { id: "comptes", label: "Comptes" },' + nav.eol +
    '      { id: "avenir", label: "À venir" },',

  admin_lucideImport:
    'import { Plus, Pencil, Trash2, X, LogOut, Tag, Package, ArrowLeft, Upload, Film, Users, Sparkles, Gauge, Wrench, Activity, Settings, LogIn, Clock, Palette } from "lucide-react";',

  admin_crmImport:
    'import { CrmAccounts, CrmRoadmap } from "@/components/AdminCrm";',

  admin_tabIcons:
    "const TAB_ICONS = {" + admin.eol +
    "  collections: Package," + admin.eol +
    "  familles: Palette," + admin.eol +
    "  promos: Tag," + admin.eol +
    "  site: Sparkles," + admin.eol +
    "  comptes: Users," + admin.eol +
    "  avenir: Clock," + admin.eol +
    "  connexions: LogIn," + admin.eol +
    "  quotas: Gauge," + admin.eol +
    "  maintenance: Wrench," + admin.eol +
    "  sante: Activity," + admin.eol +
    "};",

  admin_renderTabs:
    '        {tab === "comptes" && <CrmAccounts />}' + admin.eol +
    admin.eol +
    '        {tab === "avenir" && <CrmRoadmap />}',

  // NB : "l&apos;administration", "d&apos;export", "d&apos;effacement",
  // "L&apos;historique" : apostrophes echappees car ce texte est un enfant
  // JSX direct (pas une chaine JS), conformement a la convention deja
  // utilisee dans ce fichier.
  crm_accountsEnd:
    '      <p className="text-[11px] leading-4 text-[#8b737e]">' + crm.eol +
    "        Les adresses e-mail sont des données personnelles : cet écran est réservé à l&apos;administration. En attendant un outil d&apos;export et d&apos;effacement, une demande" + crm.eol +
    "        d&apos;effacement se traite à la main dans Supabase (Authentication, Users). L&apos;historique des connexions et les adresses IP restent dans Technique, onglet Connexions." + crm.eol +
    "      </p>" + crm.eol +
    "    </>" + crm.eol +
    "  );" + crm.eol +
    "}",

  crm_roadmapStart:
    "const ROADMAP = [" + crm.eol +
    "  {" + crm.eol +
    '    title: "Adresses de livraison et de facturation",' + crm.eol +
    '    text: "Une ou plusieurs adresses par cliente, reprises à la commande.",' + crm.eol +
    '    needs: "Paiement en ligne et tables de commandes.",' + crm.eol +
    "  }," + crm.eol +
    "  {" + crm.eol +
    "    title: \"Commandes et historique d'achat\"," + crm.eol +
    '    text: "Les commandes d\'une cliente, leur statut, le montant dépensé, la date du dernier achat.",' + crm.eol +
    '    needs: "Paiement en ligne et tables de commandes.",' + crm.eol +
    "  }," + crm.eol +
    "  {" + crm.eol +
    '    title: "Newsletter et consentements",',
};

const missing = [];
for (const [key, needle] of Object.entries(anchors)) {
  const target =
    key.startsWith("nav_") ? nav.raw :
    key.startsWith("admin_") ? admin.raw :
    crm.raw;
  const count = countOccurrences(target, needle);
  if (count !== 1) missing.push({ key, count });
}

if (missing.length > 0) {
  console.error(`✗ ${missing.length} repère(s) à adapter — aucun fichier n'a été modifié.\n`);
  for (const m of missing) {
    console.error(`  • repère « ${m.key} » (${m.count} correspondance(s) trouvée(s), 1 attendue)`);
  }
  console.error("\nVérifiez le contenu actuel des fichiers et collez-moi les lignes concernées.");
  process.exit(1);
}

// ---------------------------------------------------------------------
// 1) lib/adminNav.js
// ---------------------------------------------------------------------
let navOut = nav.raw;
if (!nav.raw.includes('{ id: "commandes", label: "Commandes" }')) {
  navOut = navOut.replace(
    anchors.nav_crmGroup,
    '      { id: "comptes", label: "Comptes" },' + nav.eol +
      '      { id: "commandes", label: "Commandes" },' + nav.eol +
      '      { id: "avenir", label: "À venir" },'
  );
}

// ---------------------------------------------------------------------
// 2) pages/admin.js
// ---------------------------------------------------------------------
let adminOut = admin.raw;

if (!adminOut.includes("ShoppingBag")) {
  adminOut = adminOut.replace(
    anchors.admin_lucideImport,
    'import { Plus, Pencil, Trash2, X, LogOut, Tag, Package, ArrowLeft, Upload, Film, Users, Sparkles, Gauge, Wrench, Activity, Settings, LogIn, Clock, Palette, ShoppingBag } from "lucide-react";'
  );
}

if (!adminOut.includes("AdminOrders")) {
  adminOut = adminOut.replace(
    anchors.admin_crmImport,
    'import { CrmAccounts, CrmRoadmap, AdminOrders } from "@/components/AdminCrm";'
  );
}

if (!adminOut.includes("commandes: ShoppingBag")) {
  adminOut = adminOut.replace(
    anchors.admin_tabIcons,
    "const TAB_ICONS = {" + admin.eol +
      "  collections: Package," + admin.eol +
      "  familles: Palette," + admin.eol +
      "  promos: Tag," + admin.eol +
      "  site: Sparkles," + admin.eol +
      "  comptes: Users," + admin.eol +
      "  commandes: ShoppingBag," + admin.eol +
      "  avenir: Clock," + admin.eol +
      "  connexions: LogIn," + admin.eol +
      "  quotas: Gauge," + admin.eol +
      "  maintenance: Wrench," + admin.eol +
      "  sante: Activity," + admin.eol +
      "};"
  );
}

if (!adminOut.includes('{tab === "commandes"')) {
  adminOut = adminOut.replace(
    anchors.admin_renderTabs,
    '        {tab === "comptes" && <CrmAccounts />}' + admin.eol +
      admin.eol +
      '        {tab === "commandes" && <AdminOrders />}' + admin.eol +
      admin.eol +
      '        {tab === "avenir" && <CrmRoadmap />}'
  );
}

// ---------------------------------------------------------------------
// 3) components/AdminCrm.js
// ---------------------------------------------------------------------
let crmOut = crm.raw;
const e = crm.eol;

if (!crmOut.includes("export function AdminOrders")) {
  const adminOrdersComponent =
    e + e +
    "// ============================================================" + e +
    "// AdminOrders : liste des commandes passees sur le site (orders, order_items)." + e +
    "// LECTURE SEULE : aucune ecriture n'est possible depuis cet ecran. Les commandes" + e +
    "// sont creees automatiquement par le webhook de paiement Stripe" + e +
    "// (pages/api/webhooks/stripe.js), jamais a la main." + e +
    "// ============================================================" + e +
    e +
    "const ORDER_STATUS_LABELS = {" + e +
    '  pending: { label: "En attente", className: "bg-amber-50 text-amber-700" },' + e +
    '  paid: { label: "Payée", className: "bg-emerald-50 text-emerald-700" },' + e +
    '  shipped: { label: "Expédiée", className: "bg-sky-50 text-sky-700" },' + e +
    '  cancelled: { label: "Annulée", className: "bg-red-50 text-red-700" },' + e +
    '  refunded: { label: "Remboursée", className: "bg-[#f5edf1] text-[#8f6075]" },' + e +
    "};" + e +
    e +
    "function orderStatusBadge(status) {" + e +
    '  const info = ORDER_STATUS_LABELS[status] || { label: status || "—", className: "bg-[#f5edf1] text-[#54434c]" };' + e +
    "  return (" + e +
    "    <span className={`rounded-full px-3 py-1 text-xs whitespace-nowrap ${info.className}`}>{info.label}</span>" + e +
    "  );" + e +
    "}" + e +
    e +
    "function formatOrderPrice(n) {" + e +
    '  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(n) || 0);' + e +
    "}" + e +
    e +
    "export function AdminOrders() {" + e +
    "  const [orders, setOrders] = useState([]);" + e +
    "  const [itemsByOrder, setItemsByOrder] = useState({});" + e +
    "  const [loading, setLoading] = useState(true);" + e +
    '  const [error, setError] = useState("");' + e +
    '  const [query, setQuery] = useState("");' + e +
    "  const [openOrderId, setOpenOrderId] = useState(null);" + e +
    e +
    "  const load = useCallback(async () => {" + e +
    "    setLoading(true);" + e +
    '    setError("");' + e +
    "    const [{ data: ordersData, error: ordersErr }, { data: itemsData, error: itemsErr }] = await Promise.all([" + e +
    '      supabase.from("orders").select("*").order("created_at", { ascending: false }),' + e +
    '      supabase.from("order_items").select("*"),' + e +
    "    ]);" + e +
    "    if (ordersErr) {" + e +
    '      setError("Impossible de charger les commandes : " + ordersErr.message);' + e +
    "      setOrders([]);" + e +
    "    } else {" + e +
    "      setOrders(ordersData || []);" + e +
    "    }" + e +
    "    if (!itemsErr) {" + e +
    "      const grouped = {};" + e +
    "      (itemsData || []).forEach((it) => {" + e +
    "        if (!grouped[it.order_id]) grouped[it.order_id] = [];" + e +
    "        grouped[it.order_id].push(it);" + e +
    "      });" + e +
    "      setItemsByOrder(grouped);" + e +
    "    }" + e +
    "    setLoading(false);" + e +
    "  }, []);" + e +
    e +
    "  useEffect(() => {" + e +
    "    load();" + e +
    "  }, [load]);" + e +
    e +
    "  const stats = useMemo(() => {" + e +
    '    const paid = orders.filter((o) => o.status === "paid" || o.status === "shipped");' + e +
    "    const revenue = paid.reduce((s, o) => s + Number(o.total || 0), 0);" + e +
    "    const monthAgo = Date.now() - 30 * 24 * 3600 * 1000;" + e +
    "    const recent = orders.filter((o) => o.created_at && new Date(o.created_at).getTime() >= monthAgo).length;" + e +
    "    return { total: orders.length, paid: paid.length, revenue, recent };" + e +
    "  }, [orders]);" + e +
    e +
    "  const q = query.trim().toLowerCase();" + e +
    "  const visible = orders.filter((o) => {" + e +
    "    if (!q) return true;" + e +
    '    const email = (o.guest_email || "").toLowerCase();' + e +
    "    const ref = String(o.id);" + e +
    "    return email.includes(q) || ref.includes(q);" + e +
    "  });" + e +
    e +
    "  const cards = [" + e +
    '    { label: "Commandes totales", value: stats.total },' + e +
    '    { label: "Commandes payées", value: stats.paid },' + e +
    '    { label: "Chiffre d\'affaires (payé)", value: formatOrderPrice(stats.revenue) },' + e +
    '    { label: "Commandes ces 30 derniers jours", value: stats.recent },' + e +
    "  ];" + e +
    e +
    "  return (" + e +
    "    <>" + e +
    '      <div className="flex justify-between items-center mb-5 gap-3">' + e +
    "        <div>" + e +
    '          <h1 className="font-serif text-2xl">Commandes</h1>' + e +
    '          <p className="text-sm text-[#8b737e]">Les commandes passées sur le site</p>' + e +
    "        </div>" + e +
    "        <button" + e +
    "          onClick={load}" + e +
    "          disabled={loading}" + e +
    '          className="flex items-center gap-1.5 rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] px-4 h-10 text-sm disabled:opacity-60"' + e +
    "        >" + e +
    '          <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Actualiser' + e +
    "        </button>" + e +
    "      </div>" + e +
    e +
    "      {error && (" + e +
    '        <div className="mb-5 rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm" role="alert">' + e +
    "          {error}" + e +
    "        </div>" + e +
    "      )}" + e +
    e +
    '      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">' + e +
    "        {cards.map((c) => (" + e +
    '          <div key={c.label} className="rounded-2xl bg-white border border-[#eee2e5] px-4 py-4">' + e +
    '            <div className="font-serif text-3xl text-[#8f6075]" data-testid="orders-stat">' + e +
    '              {loading ? "—" : c.value}' + e +
    "            </div>" + e +
    '            <div className="text-xs text-[#756a70] mt-1">{c.label}</div>' + e +
    "          </div>" + e +
    "        ))}" + e +
    "      </div>" + e +
    e +
    '      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-3">' + e +
    "        <input" + e +
    '          type="search"' + e +
    "          value={query}" + e +
    "          onChange={(e) => setQuery(e.target.value)}" + e +
    '          placeholder="Rechercher par e-mail ou numéro de commande"' + e +
    '          aria-label="Rechercher une commande"' + e +
    '          data-testid="orders-search"' + e +
    '          className="w-full sm:w-80 rounded-full border border-[#eadfe4] bg-white px-4 h-10 text-sm outline-none focus:border-[#8f6075]"' + e +
    "        />" + e +
    "      </div>" + e +
    e +
    '      <div className="bg-white rounded-2xl border border-[#eee2e5] overflow-x-auto mb-4">' + e +
    '        <table className="w-full min-w-[720px] text-sm" data-testid="orders-table">' + e +
    "          <thead>" + e +
    '            <tr className="bg-[#f5edf1] text-left text-[#8b737e]">' + e +
    '              <th className="px-4 py-3 font-medium">Référence</th>' + e +
    '              <th className="px-4 py-3 font-medium">Cliente</th>' + e +
    '              <th className="px-4 py-3 font-medium">Date</th>' + e +
    '              <th className="px-4 py-3 font-medium">Statut</th>' + e +
    '              <th className="px-4 py-3 font-medium">Montant</th>' + e +
    '              <th className="px-4 py-3 font-medium"></th>' + e +
    "            </tr>" + e +
    "          </thead>" + e +
    "          <tbody>" + e +
    "            {!loading && !error && visible.length === 0 && (" + e +
    "              <tr>" + e +
    '                <td colSpan={6} className="px-4 py-6 text-center text-[#8b737e]">' + e +
    '                  {q ? "Aucune commande ne correspond à cette recherche." : "Aucune commande pour le moment."}' + e +
    "                </td>" + e +
    "              </tr>" + e +
    "            )}" + e +
    "            {visible.map((o) => (" + e +
    "              <React.Fragment key={o.id}>" + e +
    '                <tr className="border-t border-[#eee2e5]" data-testid="orders-row">' + e +
    '                  <td className="px-4 py-3 whitespace-nowrap text-[#54434c]">#{o.id}</td>' + e +
    '                  <td className="px-4 py-3">' + e +
    '                    <span className="font-medium whitespace-nowrap">{o.guest_email || "Compte client"}</span>' + e +
    "                  </td>" + e +
    '                  <td className="px-4 py-3 whitespace-nowrap text-[#54434c]">{formatDateTime(o.created_at)}</td>' + e +
    '                  <td className="px-4 py-3">{orderStatusBadge(o.status)}</td>' + e +
    '                  <td className="px-4 py-3 whitespace-nowrap text-[#54434c]">{formatOrderPrice(o.total)}</td>' + e +
    '                  <td className="px-4 py-3 whitespace-nowrap">' + e +
    "                    <button" + e +
    '                      type="button"' + e +
    "                      onClick={() => setOpenOrderId(openOrderId === o.id ? null : o.id)}" + e +
    '                      className="text-xs text-[#8f6075] underline"' + e +
    "                    >" + e +
    '                      {openOrderId === o.id ? "Masquer" : "Voir le détail"}' + e +
    "                    </button>" + e +
    "                  </td>" + e +
    "                </tr>" + e +
    "                {openOrderId === o.id && (" + e +
    '                  <tr className="border-t border-[#eee2e5] bg-[#faf6f8]">' + e +
    '                    <td colSpan={6} className="px-4 py-4">' + e +
    '                      <div className="grid md:grid-cols-2 gap-4">' + e +
    "                        <div>" + e +
    '                          <div className="text-xs font-medium text-[#8b737e] mb-1.5">Articles</div>' + e +
    '                          <ul className="space-y-1 text-[13px] text-[#54434c]">' + e +
    "                            {(itemsByOrder[o.id] || []).map((it) => (" + e +
    '                              <li key={it.id} className="flex justify-between">' + e +
    "                                <span>{it.qty} × {it.product_name}</span>" + e +
    "                                <span>{formatOrderPrice(it.product_price * it.qty)}</span>" + e +
    "                              </li>" + e +
    "                            ))}" + e +
    "                            {(itemsByOrder[o.id] || []).length === 0 && (" + e +
    '                              <li className="text-[#8b737e]">Aucun article enregistré.</li>' + e +
    "                            )}" + e +
    "                          </ul>" + e +
    "                        </div>" + e +
    "                        <div>" + e +
    '                          <div className="text-xs font-medium text-[#8b737e] mb-1.5">Livraison</div>' + e +
    '                          <p className="text-[13px] text-[#54434c] leading-5">' + e +
    '                            {o.shipping_full_name || "—"}<br />' + e +
    '                            {o.shipping_address_line1 || ""}{o.shipping_address_line2 ? `, ${o.shipping_address_line2}` : ""}<br />' + e +
    '                            {o.shipping_postal_code || ""} {o.shipping_city || ""}<br />' + e +
    '                            {o.shipping_country || ""}' + e +
    "                          </p>" + e +
    '                          <div className="text-xs font-medium text-[#8b737e] mt-3 mb-1.5">Totaux</div>' + e +
    '                          <p className="text-[13px] text-[#54434c] leading-5">' + e +
    "                            Sous-total : {formatOrderPrice(o.subtotal)}<br />" + e +
    "                            {Number(o.discount) > 0 && <>Remise : -{formatOrderPrice(o.discount)}<br /></>}" + e +
    '                            Livraison : {Number(o.shipping) === 0 ? "Offerte" : formatOrderPrice(o.shipping)}<br />' + e +
    "                            <strong>Total : {formatOrderPrice(o.total)}</strong>" + e +
    "                          </p>" + e +
    "                        </div>" + e +
    "                      </div>" + e +
    "                    </td>" + e +
    "                  </tr>" + e +
    "                )}" + e +
    "              </React.Fragment>" + e +
    "            ))}" + e +
    "          </tbody>" + e +
    "        </table>" + e +
    "      </div>" + e +
    e +
    '      <p className="text-[11px] leading-4 text-[#8b737e]">' + e +
    "        Les commandes sont créées automatiquement par le webhook de paiement Stripe : aucune écriture manuelle n&apos;est possible depuis cet écran." + e +
    "      </p>" + e +
    "    </>" + e +
    "  );" + e +
    "}";

  crmOut = crmOut.replace(anchors.crm_accountsEnd, anchors.crm_accountsEnd + adminOrdersComponent);
}

// Retire les deux entrées ROADMAP désormais réalisables
crmOut = crmOut.replace(
  anchors.crm_roadmapStart,
  "const ROADMAP = [" + e +
    "  {" + e +
    '    title: "Newsletter et consentements",'
);

// ---------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------
fs.writeFileSync(navPath, navOut, "utf8");
fs.writeFileSync(adminPath, adminOut, "utf8");
fs.writeFileSync(crmPath, crmOut, "utf8");

console.log(`✓ ${navPath} : entrée « Commandes » ajoutée au groupe CRM.`);
console.log(`✓ ${adminPath} : icône, import et rendu de l'onglet « Commandes » ajoutés.`);
console.log(`✓ ${crmPath} : composant AdminOrders ajouté ; ROADMAP allégée des 2 entrées désormais réalisables.`);
console.log("\nTerminé.");
