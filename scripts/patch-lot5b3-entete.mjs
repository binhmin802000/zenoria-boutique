#!/usr/bin/env node
// ============================================================
// COMPLÉMENT LOT 5b (3) : en-tête de l'onglet Commandes allégé
//  - retire les 6 cartes (4 chiffres + 2 alertes)
//  - en tête : « Chiffre d'affaires encaissé » en grand + graphe par jour, puis « Parcours des commandes »
//  - le bloc « Payées » devient « À expédier » ; « dont N en alerte » s'affiche dans « En attente »
//  - période, recherche, tableau, détail et actions : inchangés
// Modifie uniquement components/AdminCrm.js. À appliquer APRÈS patch-lot5b-commandes.mjs et patch-lot5b2-parcours.mjs.
//   node scripts/patch-lot5b3-entete.mjs --dry-run
//   node scripts/patch-lot5b3-entete.mjs --apply
// ============================================================
import fs from "node:fs";
const MARKER = "ZENORIA_ORDERS_5B3_V1";
const mode = process.argv.includes("--apply") ? "apply" : process.argv.includes("--dry-run") ? "dry" : null;
const FILES = [
 {
  "path": "components/AdminCrm.js",
  "patches": [
   {
    "name": "T1 bloc « Payées » renomme « À expédier »",
    "find": [
     "{ key: \"paid\", label: \"Payées\", color: \"#8f6075\" },"
    ],
    "replace": [
     "  { key: \"paid\", label: \"À expédier\", color: \"#8f6075\" }, // ZENORIA_ORDERS_5B3_V1 : payées, pas encore expédiées"
    ]
   },
   {
    "name": "T2 tableau des 4 cartes retire (calcul)",
    "find": [
     "  const cards = [",
     "    { label: \"Commandes totales\", value: stats.total },",
     "    { label: \"Commandes payées\", value: stats.paid },",
     "    { label: \"Chiffre d'affaires encaissé\", value: formatOrderPrice(revenueCashed) },",
     "    { label: \"Commandes ces 30 derniers jours\", value: stats.recent },",
     "  ];"
    ],
    "replace": [
     "  // ZENORIA_ORDERS_5B3_V1 : les 4 cartes de chiffres sont retirées (chiffre d'affaires et parcours en tête de page)"
    ]
   },
   {
    "name": "T3 6 cartes remplacees par CA + parcours en tete",
    "find": [
     "      <div className=\"grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6\">",
     "        {cards.map((c) => (",
     "          <div key={c.label} className=\"rounded-2xl bg-white border border-[#eee2e5] px-4 py-4\">",
     "            <div className=\"font-serif text-3xl text-[#8f6075]\" data-testid=\"orders-stat\">",
     "              {loading ? \"—\" : c.value}",
     "            </div>",
     "            <div className=\"text-xs text-[#756a70] mt-1\">{c.label}</div>",
     "          </div>",
     "        ))}",
     "      </div>",
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
     "      </div>"
    ],
    "replace": [
     "      {/* ZENORIA_ORDERS_5B3_V1 : en tête, le chiffre d'affaires encaissé (grand total + graphe), puis le parcours des commandes.",
     "          Les 6 anciennes cartes (4 chiffres + 2 alertes) sont retirées : leurs informations sont reprises ici. */}",
     "      <div className=\"grid gap-3 mb-5\">",
     "        <div className=\"rounded-2xl bg-white border border-[#eee2e5] px-5 py-4\" data-testid=\"orders-revenue-chart\">",
     "          <div className=\"flex flex-wrap items-end justify-between gap-3\">",
     "            <div>",
     "              <div className=\"text-xs font-medium text-[#8b737e]\">Chiffre d&apos;affaires encaissé</div>",
     "              <div className=\"font-serif text-4xl text-[#8f6075] mt-1 leading-tight\" data-testid=\"orders-revenue-total\">{loading ? \"—\" : formatOrderPrice(revenueCashed)}</div>",
     "              <div className=\"text-[11px] text-[#8b737e] mt-0.5\">{dateFrom || dateTo ? \"Sur la période choisie\" : \"Depuis l'ouverture de la boutique\"} · selon la date d&apos;encaissement</div>",
     "            </div>",
     "            <div className=\"text-xs text-[#8b737e]\">Graphe : {chart.days.length} jours · {formatOrderPrice(chart.total)}</div>",
     "          </div>",
     "          <div className=\"flex items-end gap-[3px] h-24 mt-3\">",
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
     "          <p className=\"mt-1 text-[11px] text-[#8b737e]\">Paiement par carte confirmé ou virement reçu. Sans période choisie, le graphe montre les 30 derniers jours. Survolez une barre pour le montant du jour.</p>",
     "        </div>",
     "        <div className=\"rounded-2xl bg-white border border-[#eee2e5] px-4 py-3.5\" data-testid=\"orders-flow\">",
     "          <div className=\"text-xs font-medium text-[#8b737e] mb-2\">Parcours des commandes (période choisie, date de commande)</div>",
     "          <div className=\"flex gap-px rounded-lg overflow-hidden\">",
     "            {segments.map((s) => (",
     "              <button",
     "                key={s.key}",
     "                type=\"button\"",
     "                onClick={() => setStatusFilter(statusFilter === s.key ? \"all\" : s.key)}",
     "                aria-pressed={statusFilter === s.key}",
     "                data-testid={\"orders-flow-\" + s.key}",
     "                style={{ flex: 1, background: s.color, opacity: s.count ? 1 : 0.5, boxShadow: statusFilter === s.key ? \"inset 0 0 0 3px #342b32\" : \"none\" }}",
     "                className=\"min-h-[64px] min-w-0 px-1 py-1.5 text-white text-center overflow-hidden\"",
     "              >",
     "                <span className=\"block text-[11px] font-medium truncate\">{s.label}</span>",
     "                <span className=\"block font-serif text-2xl leading-7\">{loading ? \"—\" : s.count}</span>",
     "                {s.key === \"waiting\" && alertCount > 0 && (",
     "                  <span className=\"mt-0.5 inline-block rounded-full bg-white text-red-700 px-2 text-[10px] font-semibold\" data-testid=\"orders-flow-alert\">dont {alertCount} en alerte</span>",
     "                )}",
     "              </button>",
     "            ))}",
     "          </div>",
     "          <p className=\"mt-1.5 text-[11px] text-[#8b737e]\">Cliquez sur un bloc pour filtrer la liste ; un second clic retire le filtre.</p>",
     "        </div>",
     "        {statusFilter !== \"all\" && (",
     "          <div className=\"flex flex-wrap items-center gap-3\">",
     "            <span className=\"rounded-full bg-[#f5edf1] text-[#8f6075] px-3 py-1 text-xs\" data-testid=\"orders-filter-label\">Filtre : {STATUS_FILTER_LABELS[statusFilter]}</span>",
     "            <button type=\"button\" onClick={() => setStatusFilter(\"all\")} className=\"text-xs text-[#8f6075] underline\" data-testid=\"orders-filter-clear\">Tout afficher</button>",
     "          </div>",
     "        )}",
     "      </div>"
    ]
   },
   {
    "name": "T4 ancien emplacement du parcours et du graphe",
    "find": [
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
     "                  style={{ flex: 1, background: s.color, opacity: s.count ? 1 : 0.5, boxShadow: statusFilter === s.key ? \"inset 0 0 0 3px #342b32\" : \"none\" }}",
     "                  className=\"h-16 min-w-0 px-1 text-white text-center overflow-hidden\"",
     "                >",
     "                  <span className=\"block text-[11px] font-medium truncate\">{s.label}</span>",
     "                  <span className=\"block font-serif text-2xl leading-7\">{s.count}</span>",
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
     "      </div>"
    ],
    "replace": [
     "      {/* ZENORIA_ORDERS_5B3_V1 : parcours et chiffre d'affaires déplacés en tête de page */}"
    ]
   }
  ],
  "finals": [
   "ZENORIA_ORDERS_5B3_V1",
   "orders-revenue-total",
   "orders-flow-alert",
   "label: \"À expédier\""
  ],
  "forbidden": [
   "orders-alert-transfer",
   "orders-alert-ship",
   "data-testid=\"orders-stat\"",
   "label: \"Commandes totales\""
  ]
 }
];
function fail(m) { console.error("\nECHEC : " + m); console.error("Aucun fichier n'a ete modifie."); process.exit(1); }
if (!mode) fail("indiquez --dry-run ou --apply.");
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const toRegex = (lines) => new RegExp(esc(lines.map((l) => l.trim()).filter((l) => l).join("\n")).replace(/\s+/g, "\\s+").split("'").join("(?:&apos;|'|\u2019)"), "g");
console.log("Mode : " + (mode === "apply" ? "APPLICATION" : "DRY-RUN (aucune ecriture)") + "\n");
const results = []; const problems = [];
for (const f of FILES) {
  if (!fs.existsSync(f.path)) fail(f.path + " est introuvable. Lancez la commande depuis la racine du projet (dossier zenoria).");
  const original = fs.readFileSync(f.path, "utf8");
  const crlf = original.includes("\r\n");
  let content = original.replace(/\r\n/g, "\n");
  console.log(f.path + " (fins de ligne " + (crlf ? "Windows CRLF" : "Unix LF") + ")");
  if (content.includes(MARKER)) fail("le complement est deja applique.");
  if (!content.includes("ZENORIA_ORDERS_5B2_V1")) fail("les complements 5b et 5b2 ne sont pas appliques.");
  for (const p of f.patches) { const c = (content.match(toRegex(p.find)) || []).length; console.log((c === 1 ? "  OK  " : " ERREUR ") + p.name + " : " + c + " occurrence(s)"); if (c !== 1) problems.push(p.name + " (" + c + ")"); }
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
console.log("\nCOMPLEMENT APPLIQUE. Retour arriere avant commit : git restore components/AdminCrm.js");
