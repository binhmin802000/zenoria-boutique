#!/usr/bin/env node
// ============================================================
// PATCH LOT 5b : onglet Commandes (components/AdminCrm.js uniquement)
//  - deux cartes d'alerte cliquables : « Virements en alerte » et « À expédier »
//  - barre « Parcours des commandes » (période choisie, date de commande), segments cliquables
//  - graphe « Chiffre d'affaires encaissé par jour » (date d'encaissement)
//  - la carte « Chiffre d'affaires » passe à la date d'encaissement
// Filtres, tableau, détail, actions et historique des commandes : INCHANGÉS. Aucune base de données.
//   node scripts/patch-lot5b-commandes.mjs --dry-run
//   node scripts/patch-lot5b-commandes.mjs --apply
// ============================================================
import fs from "node:fs";
const MARKER = "ZENORIA_ORDERS_5B_V1";
const mode = process.argv.includes("--apply") ? "apply" : process.argv.includes("--dry-run") ? "dry" : null;
const FILES = [
 {
  "path": "components/AdminCrm.js",
  "patches": [
   {
    "name": "B1 fonctions de filtre par etat",
    "find": [
     "export function AdminOrders() {"
    ],
    "replace": [
     "// ZENORIA_ORDERS_5B_V1 : filtres par état (cartes d'alerte et barre « Parcours des commandes »)",
     "const ORDER_SEGMENTS = [",
     "  { key: \"waiting\", label: \"En attente\", color: \"#c98a2b\" },",
     "  { key: \"paid\", label: \"Payées\", color: \"#8f6075\" },",
     "  { key: \"shipped\", label: \"Expédiées\", color: \"#6d4659\" },",
     "  { key: \"delivered\", label: \"Livrées\", color: \"#2f7a57\" },",
     "  { key: \"closed\", label: \"Annulées\", color: \"#9d9197\" },",
     "];",
     "const STATUS_FILTER_LABELS = {",
     "  all: \"Toutes les commandes\",",
     "  alert: \"Virements en alerte\",",
     "  waiting: \"En attente de paiement\",",
     "  paid: \"Payées, à expédier\",",
     "  shipped: \"Expédiées\",",
     "  delivered: \"Livrées\",",
     "  closed: \"Annulées, expirées ou remboursées\",",
     "};",
     "function matchesStatus(order, filter, graceDays) {",
     "  switch (filter) {",
     "    case \"alert\":",
     "      return order.status === \"pending_transfer\" && isAutoCancelAlert(order.transfer_due_at, graceDays);",
     "    case \"waiting\":",
     "      return order.status === \"pending_transfer\" || order.status === \"pending\";",
     "    case \"paid\":",
     "      return order.status === \"paid\";",
     "    case \"shipped\":",
     "      return order.status === \"shipped\";",
     "    case \"delivered\":",
     "      return order.status === \"delivered\";",
     "    case \"closed\":",
     "      return [\"cancelled\", \"expired\", \"refunded\"].includes(order.status);",
     "    default:",
     "      return true;",
     "  }",
     "}",
     "function formatParisDay(day) {",
     "  return String(day || \"\").split(\"-\").reverse().join(\"/\");",
     "}",
     "export function AdminOrders() {"
    ]
   },
   {
    "name": "B2 etat du filtre",
    "find": [
     "const [graceDays, setGraceDays] = useState(DEFAULT_BANK_TRANSFER.grace_days);"
    ],
    "replace": [
     "  const [graceDays, setGraceDays] = useState(DEFAULT_BANK_TRANSFER.grace_days);",
     "  const [statusFilter, setStatusFilter] = useState(\"all\"); // ZENORIA_ORDERS_5B_V1"
    ]
   },
   {
    "name": "B3 la liste suit le filtre par etat",
    "find": [
     "const visible = filteredOrders.filter((o) => {",
     "if (!q) return true;"
    ],
    "replace": [
     "  const visible = filteredOrders.filter((o) => {",
     "    if (!matchesStatus(o, statusFilter, graceDays)) return false; // ZENORIA_ORDERS_5B_V1",
     "    if (!q) return true;"
    ]
   },
   {
    "name": "B4 calculs (alertes, parcours, CA encaisse)",
    "find": [
     "const cards = [",
     "{ label: \"Commandes totales\", value: stats.total },"
    ],
    "replace": [
     "  // ZENORIA_ORDERS_5B_V1 : alertes, parcours et chiffre d'affaires à la date d'encaissement",
     "  const baseOrders = orders.filter((o) => includeTestData || !o.is_test);",
     "  const alertCount = baseOrders.filter((o) => matchesStatus(o, \"alert\", graceDays)).length;",
     "  const waitingTransfer = baseOrders.filter((o) => o.status === \"pending_transfer\").length;",
     "  const toShip = baseOrders.filter((o) => o.status === \"paid\").length;",
     "  const segments = ORDER_SEGMENTS.map((s) => ({ ...s, count: filteredOrders.filter((o) => matchesStatus(o, s.key, graceDays)).length })).filter((s) => s.count > 0);",
     "  const cashed = baseOrders.filter((o) => [\"paid\", \"shipped\", \"delivered\"].includes(o.status) && o.paid_at);",
     "  const revenueCashed = cashed",
     "    .filter((o) => (!dateFrom || parisDay(o.paid_at) >= dateFrom) && (!dateTo || parisDay(o.paid_at) <= dateTo))",
     "    .reduce((s, o) => s + Number(o.total || 0), 0);",
     "  const chart = (() => {",
     "    const end = dateTo || parisDay(new Date());",
     "    const start = dateFrom && dateFrom <= end ? dateFrom : addDaysToParisDay(end, -29);",
     "    const n = Math.max(1, Math.min(92, Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1));",
     "    const days = [];",
     "    for (let i = n - 1; i >= 0; i -= 1) days.push(addDaysToParisDay(end, -i));",
     "    const totals = Object.fromEntries(days.map((d) => [d, 0]));",
     "    cashed.forEach((o) => {",
     "      const d = parisDay(o.paid_at);",
     "      if (Object.prototype.hasOwnProperty.call(totals, d)) totals[d] += Number(o.total || 0);",
     "    });",
     "    const values = days.map((d) => totals[d]);",
     "    return { days, values, total: values.reduce((a, b) => a + b, 0), max: Math.max(1, ...values) };",
     "  })();",
     "  const cards = [",
     "    { label: \"Commandes totales\", value: stats.total },"
    ]
   },
   {
    "name": "B5 carte CA a la date d'encaissement",
    "find": [
     "{ label: \"Chiffre d'affaires (payé)\", value: formatOrderPrice(stats.revenue) },"
    ],
    "replace": [
     "    { label: \"Chiffre d'affaires encaissé\", value: formatOrderPrice(revenueCashed) },"
    ]
   },
   {
    "name": "B6 cartes d'alerte",
    "find": [
     "<div className=\"flex flex-wrap items-center gap-2 mb-3\">",
     "<button type=\"button\" onClick={() => setPreset(\"today\")}"
    ],
    "replace": [
     "      {/* ZENORIA_ORDERS_5B_V1 : alertes cliquables (filtrent la liste ; un second clic retire le filtre) */}",
     "      <div className=\"flex flex-wrap gap-3 mb-6\" data-testid=\"orders-alerts\">",
     "        <button",
     "          type=\"button\"",
     "          onClick={() => setStatusFilter(statusFilter === \"alert\" ? \"all\" : \"alert\")}",
     "          aria-pressed={statusFilter === \"alert\"}",
     "          data-testid=\"orders-alert-transfer\"",
     "          className={`text-left rounded-2xl px-4 py-3 min-w-[210px] border transition ${alertCount ? \"bg-red-50 border-red-200 text-red-700\" : \"bg-white border-[#eee2e5] text-[#8b737e]\"} ${statusFilter === \"alert\" ? \"ring-2 ring-[#8f6075]\" : \"\"}`}",
     "        >",
     "          <div className=\"text-xs\">Virements en alerte</div>",
     "          <div className=\"mt-0.5\"><span className=\"font-serif text-2xl\">{loading ? \"—\" : alertCount}</span> <span className=\"text-xs\">/ {waitingTransfer} en attente de virement</span></div>",
     "        </button>",
     "        <button",
     "          type=\"button\"",
     "          onClick={() => setStatusFilter(statusFilter === \"paid\" ? \"all\" : \"paid\")}",
     "          aria-pressed={statusFilter === \"paid\"}",
     "          data-testid=\"orders-alert-ship\"",
     "          className={`text-left rounded-2xl px-4 py-3 min-w-[210px] border transition ${toShip ? \"bg-amber-50 border-amber-200 text-amber-800\" : \"bg-white border-[#eee2e5] text-[#8b737e]\"} ${statusFilter === \"paid\" ? \"ring-2 ring-[#8f6075]\" : \"\"}`}",
     "        >",
     "          <div className=\"text-xs\">À expédier</div>",
     "          <div className=\"mt-0.5\"><span className=\"font-serif text-2xl\">{loading ? \"—\" : toShip}</span> <span className=\"text-xs\">commande{toShip > 1 ? \"s\" : \"\"} payée{toShip > 1 ? \"s\" : \"\"}</span></div>",
     "        </button>",
     "      </div>",
     "      <div className=\"flex flex-wrap items-center gap-2 mb-3\">",
     "        <button type=\"button\" onClick={() => setPreset(\"today\")}"
    ]
   },
   {
    "name": "B7 parcours et graphe avant le tableau",
    "find": [
     "<div className=\"bg-white rounded-2xl border border-[#eee2e5] overflow-x-auto mb-4\">",
     "<table className=\"w-full min-w-[720px] text-sm\" data-testid=\"orders-table\">"
    ],
    "replace": [
     "      {/* ZENORIA_ORDERS_5B_V1 : parcours des commandes et chiffre d'affaires encaissé */}",
     "      <div className=\"grid gap-3 mb-4\">",
     "        <div className=\"rounded-2xl bg-white border border-[#eee2e5] px-4 py-3.5\" data-testid=\"orders-flow\">",
     "          <div className=\"text-xs font-medium text-[#8b737e] mb-2\">Parcours des commandes (période choisie, date de commande)</div>",
     "          {segments.length === 0 ? (",
     "            <p className=\"text-[12px] text-[#8b737e]\">Aucune commande sur la période.</p>",
     "          ) : (",
     "            <div className=\"flex gap-px rounded-lg overflow-hidden\">",
     "              {segments.map((s) => (",
     "                <button",
     "                  key={s.key}",
     "                  type=\"button\"",
     "                  onClick={() => setStatusFilter(statusFilter === s.key ? \"all\" : s.key)}",
     "                  aria-pressed={statusFilter === s.key}",
     "                  data-testid={\"orders-flow-\" + s.key}",
     "                  style={{ flex: s.count, background: s.color, boxShadow: statusFilter === s.key ? \"inset 0 0 0 3px #342b32\" : \"none\" }}",
     "                  className=\"h-10 min-w-0 px-1 text-[11px] font-semibold text-white whitespace-nowrap overflow-hidden\"",
     "                >",
     "                  {s.label} {s.count}",
     "                </button>",
     "              ))}",
     "            </div>",
     "          )}",
     "          <p className=\"mt-1.5 text-[11px] text-[#8b737e]\">Cliquez sur un segment pour filtrer la liste ; un second clic retire le filtre.</p>",
     "        </div>",
     "        <div className=\"rounded-2xl bg-white border border-[#eee2e5] px-4 py-3.5\" data-testid=\"orders-revenue-chart\">",
     "          <div className=\"flex flex-wrap justify-between gap-2\">",
     "            <div className=\"text-xs font-medium text-[#8b737e]\">Chiffre d&apos;affaires encaissé par jour</div>",
     "            <div className=\"text-xs text-[#8b737e]\">Total : <strong className=\"text-[#412f3b]\">{formatOrderPrice(chart.total)}</strong></div>",
     "          </div>",
     "          <div className=\"flex items-end gap-[3px] h-24 mt-2\">",
     "            {chart.values.map((v, i) => (",
     "              <div",
     "                key={chart.days[i]}",
     "                title={formatParisDay(chart.days[i]) + \" : \" + formatOrderPrice(v)}",
     "                className=\"flex-1 rounded-t bg-[#8f6075]\"",
     "                style={{ height: Math.max(2, Math.round((v / chart.max) * 100)) + \"%\", opacity: v ? 1 : 0.25 }}",
     "              />",
     "            ))}",
     "          </div>",
     "          <div className=\"flex justify-between text-[10px] text-[#8b737e] mt-1\">",
     "            <span>{formatParisDay(chart.days[0])}</span>",
     "            <span>{formatParisDay(chart.days[chart.days.length - 1])}</span>",
     "          </div>",
     "          <p className=\"mt-1 text-[11px] text-[#8b737e]\">Selon la date d&apos;encaissement (paiement par carte confirmé ou virement reçu). Sans période choisie : les 30 derniers jours.</p>",
     "        </div>",
     "        {statusFilter !== \"all\" && (",
     "          <div className=\"flex flex-wrap items-center gap-3\">",
     "            <span className=\"rounded-full bg-[#f5edf1] text-[#8f6075] px-3 py-1 text-xs\" data-testid=\"orders-filter-label\">Filtre : {STATUS_FILTER_LABELS[statusFilter]}</span>",
     "            <button type=\"button\" onClick={() => setStatusFilter(\"all\")} className=\"text-xs text-[#8f6075] underline\" data-testid=\"orders-filter-clear\">Tout afficher</button>",
     "          </div>",
     "        )}",
     "      </div>",
     "      <div className=\"bg-white rounded-2xl border border-[#eee2e5] overflow-x-auto mb-4\">",
     "        <table className=\"w-full min-w-[720px] text-sm\" data-testid=\"orders-table\">"
    ]
   }
  ],
  "finals": [
   "ZENORIA_ORDERS_5B_V1",
   "matchesStatus(o, statusFilter, graceDays)",
   "revenueCashed",
   "orders-revenue-chart",
   "orders-flow",
   "orders-alert-transfer"
  ],
  "forbidden": [
   "Chiffre d'affaires (payé)"
  ]
 }
];
function fail(m) { console.error("\nECHEC : " + m); console.error("Aucun fichier n'a ete modifie."); process.exit(1); }
if (!mode) fail("indiquez --dry-run ou --apply.");
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const toRegex = (lines) => new RegExp(esc(lines.map((l) => l.trim()).join("\n")).replace(/\s+/g, "\\s+").split("'").join("(?:&apos;|'|\u2019)"), "g");
console.log("Mode : " + (mode === "apply" ? "APPLICATION" : "DRY-RUN (aucune ecriture)") + "\n");
const results = []; const problems = [];
for (const f of FILES) {
  if (!fs.existsSync(f.path)) fail(f.path + " est introuvable. Lancez la commande depuis la racine du projet (dossier zenoria).");
  const original = fs.readFileSync(f.path, "utf8");
  const crlf = original.includes("\r\n");
  let content = original.replace(/\r\n/g, "\n");
  console.log(f.path + " (fins de ligne " + (crlf ? "Windows CRLF" : "Unix LF") + ")");
  if (content.includes(MARKER)) fail(f.path + " : le patch est deja applique (marqueur " + MARKER + " present).");
  if (!content.includes("ZENORIA_ADMIN_NAV_5A_V1")) fail(f.path + " : le lot 5a n'est pas applique.");
  for (const p of f.patches) { const c = (content.match(toRegex(p.find)) || []).length; console.log((c === 1 ? "  OK  " : " ERREUR ") + p.name + " : " + c + " occurrence(s)"); if (c !== 1) problems.push(p.name + " (" + c + " occurrence(s) au lieu de 1)"); }
  if (!problems.length) for (const p of f.patches) content = content.replace(toRegex(p.find), () => p.replace.join("\n"));
  results.push({ f, content, crlf });
}
if (problems.length) fail("verifier :\n  - " + problems.join("\n  - "));
for (const r of results) {
  for (const n of r.f.finals) if (!r.content.includes(n)) fail("controle final : « " + n + " » absent apres patch.");
  for (const b of r.f.forbidden) if (r.content.includes(b)) fail("controle final : « " + b + " » encore present apres patch.");
}
if (mode === "dry") { console.log("\nDRY-RUN termine : conforme. Rien n'a ete ecrit."); process.exit(0); }
for (const r of results) fs.writeFileSync(r.f.path, r.crlf ? r.content.replace(/\n/g, "\r\n") : r.content, "utf8");
console.log("\nPATCH APPLIQUE. Retour arriere avant commit : git restore components/AdminCrm.js");
