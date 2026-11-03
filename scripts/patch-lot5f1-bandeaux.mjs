// patch-lot5f1-bandeaux.mjs
// Lot 5f-1 : bandeaux de chiffres en tête de Bijoux, Avis, RGPD et Connexions. Sans SQL.
//
//   - crée components/StatCards.js (rangée de cartes de chiffres, cliquables ou non)
//   - pages/admin.js (Bijoux)          : 4 cartes (Épuisés, Dernier exemplaire, Pièces uniques réservées, Pièces uniques),
//                                        mêmes règles et mêmes chiffres que l'Accueil ; un clic filtre la liste, un second clic retire le filtre
//   - components/AdminReviews.js (Avis): les 4 cartes existantes deviennent des cartes StatCards ; « en attente » et « en retard » ouvrent
//                                        l'onglet En attente, « publiés » ouvre Publiés ; « le plus ancien : N jours ouvrés » sous « en attente »
//   - components/AdminDataRequests.js (RGPD) : 3 cartes (en attente, la plus ancienne sur 30 jours avec seuil rouge à 25 jours, traitées)
//   - components/AdminConnections.js   : 5e carte rouge « Comptes à surveiller », affichée seulement s'il y en a ; un clic filtre la liste des comptes
//
// Prérequis : lots 5d-bis (ZENORIA_HOME_5D2_V1 dans pages/admin.js) et 5e (ZENORIA_FLAGGED_5E_V1 dans AdminConnections.js).
//
// Usage :  node scripts/patch-lot5f1-bandeaux.mjs --dry-run
//          node scripts/patch-lot5f1-bandeaux.mjs --apply
// Marqueur : ZENORIA_BANNERS_5F1_V1 (le script est idempotent)

import fs from "node:fs";
import path from "node:path";

const MARK = "ZENORIA_BANNERS_5F1_V1";
const ROOT = process.cwd();
const F_ADMIN = path.join(ROOT, "pages", "admin.js");
const F_REVIEWS = path.join(ROOT, "components", "AdminReviews.js");
const F_DATA = path.join(ROOT, "components", "AdminDataRequests.js");
const F_CONN = path.join(ROOT, "components", "AdminConnections.js");
const F_CARDS = path.join(ROOT, "components", "StatCards.js");
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const dry = args.includes("--dry-run");

if (apply === dry) {
  console.error("Usage : node scripts/patch-lot5f1-bandeaux.mjs --dry-run | --apply");
  process.exit(1);
}
console.log("Mode : " + (apply ? "APPLY (ecriture)" : "DRY-RUN (aucune ecriture)"));

function fail(msg) {
  console.error("ECHEC : " + msg);
  console.error("Aucune modification n'a ete ecrite.");
  process.exit(1);
}

for (const f of [F_ADMIN, F_REVIEWS, F_DATA, F_CONN]) {
  if (!fs.existsSync(f)) fail(path.relative(ROOT, f) + " introuvable (lancez le script depuis la racine du projet).");
}

function readSrc(file) {
  const raw = fs.readFileSync(file, "utf8");
  const bom = raw.charCodeAt(0) === 0xfeff;
  return { bom, crlf: raw.includes("\r\n"), src: (bom ? raw.slice(1) : raw).replace(/\r\n/g, "\n") };
}
function occurrences(str, sub) {
  let n = 0;
  let i = str.indexOf(sub);
  while (i >= 0) {
    n += 1;
    i = str.indexOf(sub, i + sub.length);
  }
  return n;
}
function serialize(doc) {
  return (doc.bom ? "\uFEFF" : "") + (doc.crlf ? doc.src.replace(/\n/g, "\r\n") : doc.src);
}
function once(doc, needle, label) {
  const n = occurrences(doc.src, needle);
  if (n !== 1) fail(label + " : " + n + " occurrence(s) trouvee(s) au lieu de 1.");
}
function replaceOnce(doc, needle, replacement, label) {
  once(doc, needle, label);
  doc.src = doc.src.replace(needle, () => replacement);
}
// Affiche, avec les espaces rendus visibles, les lignes reelles autour d'un repere (aide au diagnostic)
function showContext(doc, hints) {
  const lines = doc.src.split("\n");
  for (const hint of hints || []) {
    const at = lines.findIndex((l) => l.includes(hint));
    if (at < 0) {
      console.error("  Repere « " + hint + " » : introuvable.");
      continue;
    }
    console.error("  Repere « " + hint + " » trouve ligne " + (at + 1) + " :");
    for (let i = Math.max(0, at - 1); i <= Math.min(lines.length - 1, at + 1); i += 1) {
      console.error("    " + (i + 1) + " | " + JSON.stringify(lines[i]));
    }
  }
}
// Remplace un bloc repere par une expression reguliere tolerante (espaces, lignes vides). replacement : texte, ou fonction (match, ...groupes)
function replaceRegexOnce(doc, re, replacement, label, hints) {
  const n = (doc.src.match(new RegExp(re.source, "g")) || []).length;
  if (n !== 1) {
    if (n === 0) showContext(doc, hints);
    fail(label + " : " + n + " occurrence(s) trouvee(s) au lieu de 1.");
  }
  doc.src = doc.src.replace(re, (...m) => (typeof replacement === "function" ? replacement(...m) : replacement));
}
function afterLine(doc, needle, addition, label) {
  once(doc, needle, label);
  const idx = doc.src.indexOf(needle);
  const eol = doc.src.indexOf("\n", idx);
  const end = eol < 0 ? doc.src.length : eol;
  doc.src = doc.src.slice(0, end) + "\n" + addition + doc.src.slice(end);
}
function beforeLine(doc, needle, addition, label) {
  once(doc, needle, label);
  const idx = doc.src.indexOf(needle);
  const start = doc.src.lastIndexOf("\n", idx) + 1;
  doc.src = doc.src.slice(0, start) + addition + "\n" + doc.src.slice(start);
}

const admin = readSrc(F_ADMIN);
const reviews = readSrc(F_REVIEWS);
const data = readSrc(F_DATA);
const conn = readSrc(F_CONN);
const docs = [admin, reviews, data, conn];
const names = ["pages/admin.js", "components/AdminReviews.js", "components/AdminDataRequests.js", "components/AdminConnections.js"];

if (docs.every((d) => d.src.includes(MARK)) && fs.existsSync(F_CARDS)) {
  console.log("Deja applique (" + MARK + " present). Rien a faire.");
  process.exit(0);
}
if (docs.some((d) => d.src.includes(MARK))) fail("Etat incoherent : le marqueur n'est present que dans une partie des fichiers. Restaurez-les (git checkout) puis relancez.");
if (fs.existsSync(F_CARDS)) fail("components/StatCards.js existe deja sans que les fichiers soient patches.");
if (!admin.src.includes("ZENORIA_HOME_5D2_V1")) fail("pages/admin.js ne contient pas ZENORIA_HOME_5D2_V1 : le lot 5d-bis doit etre applique avant.");
if (!conn.src.includes("ZENORIA_FLAGGED_5E_V1")) fail("components/AdminConnections.js ne contient pas ZENORIA_FLAGGED_5E_V1 : le lot 5e doit etre applique avant.");
docs.forEach((d, i) => console.log(names[i] + " (fins de ligne " + (d.crlf ? "Windows CRLF" : "LF") + ")"));
const before = docs.map((d) => d.src.split("\n").length);

// ------------------------------------------------------------------
// Nouveau composant
// ------------------------------------------------------------------
const CARDS = String.raw`// ZENORIA_BANNERS_5F1_V1 : rangée de cartes de chiffres en tête d'un écran de l'administration.
// Une carte avec onClick est un bouton (filtre) ; "active" la surligne ; tone "red" la met en alerte.
import React from "react";

export default function StatCards({ cards, className, testId }) {
  return (
    <div className={className || "grid grid-cols-2 lg:grid-cols-4 gap-3"} data-testid={testId}>
      {cards.map((c) => {
        const red = c.tone === "red";
        const base = "rounded-2xl bg-white border px-4 py-4 text-left w-full min-w-0 " + (red ? "border-red-200" : "border-[#eee2e5]");
        const body = (
          <>
            <div className={"font-serif text-3xl " + (red ? "text-red-600" : "text-[#8f6075]")}>{c.value}</div>
            <div className="text-xs text-[#756a70] mt-1 leading-4">{c.label}</div>
            {c.sub ? <div className={"text-[11px] mt-1 leading-4 " + (red ? "text-red-600" : "text-[#8b737e]")}>{c.sub}</div> : null}
          </>
        );
        if (c.onClick) {
          return (
            <button
              key={c.key}
              type="button"
              onClick={c.onClick}
              aria-pressed={Boolean(c.active)}
              data-testid={"card-" + c.key}
              className={base + " hover:shadow-sm transition" + (c.active ? " ring-2 ring-[#8f6075]" : "")}
            >
              {body}
            </button>
          );
        }
        return (
          <div key={c.key} data-testid={"card-" + c.key} className={base}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
`;

// ------------------------------------------------------------------
// pages/admin.js (Bijoux)
// ------------------------------------------------------------------
afterLine(admin, 'import AdminHome from "@/components/AdminHome";', 'import StatCards from "@/components/StatCards"; // ' + MARK, "Import AdminHome (admin.js)");
beforeLine(
  admin,
  "{/* ZENORIA_HOME_5D2_V1 : filtre de stock venu de l'Accueil */}",
  [
    "            {/* " + MARK + " : bandeau de chiffres (mêmes règles et mêmes chiffres que les tuiles de l'Accueil) ; un clic filtre la liste */}",
    "            {(() => {",
    "              const count = (k) => products.filter((p) => stockFilterMatches(k, p, pieceHolds)).length;",
    '              const uniqueStates = products.filter((p) => stockFilterMatches("unique", p, pieceHolds)).map((p) => pieceStateFor(p.id, pieceHolds).state);',
    "              const toggle = (k) => setStockFilter(stockFilter === k ? \"\" : k);",
    '              const v = (n) => (productsLoading ? "—" : n);',
    "              return (",
    "                <>",
    "                  <StatCards",
    '                    testId="products-cards"',
    '                    className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-2"',
    "                    cards={[",
    '                      { key: "out", value: v(count("out")), label: "Bijoux épuisés", sub: "visibles sur le site, stock à 0", tone: !productsLoading && count("out") > 0 ? "red" : "", onClick: () => toggle("out"), active: stockFilter === "out" },',
    '                      { key: "last", value: v(count("last")), label: "Dernier exemplaire", sub: "stock à 1", onClick: () => toggle("last"), active: stockFilter === "last" },',
    '                      { key: "reserved", value: v(count("reserved")), label: "Pièces uniques réservées", sub: "en cours de commande", onClick: () => toggle("reserved"), active: stockFilter === "reserved" },',
    '                      { key: "unique", value: v(uniqueStates.filter((s) => s === "available").length + " / " + uniqueStates.filter((s) => s === "sold").length), label: "Pièces uniques (disponibles / vendues)", sub: "bijoux en ligne", onClick: () => toggle("unique"), active: stockFilter === "unique" },',
    "                    ]}",
    "                  />",
    '                  <p className="text-[11px] leading-4 text-[#8b737e] mb-5">Seuls les bijoux visibles sur le site sont comptés. Un clic sur une carte filtre la liste ; un second clic retire le filtre.</p>',
    "                </>",
    "              );",
    "            })()}",
  ].join("\n"),
  "Filtre de stock (admin.js)"
);

// ------------------------------------------------------------------
// components/AdminReviews.js (Avis)
// ------------------------------------------------------------------
afterLine(
  reviews,
  'import { supabase } from "@/lib/supabase";',
  'import StatCards from "@/components/StatCards"; // ' + MARK,
  "Import supabase (AdminReviews)"
);
replaceOnce(
  reviews,
  "return { pending: pending.length, late: late.length, published: pub.length, avg, count };",
  "const oldestDays = pending.length ? Math.max(...pending.map((r) => businessDaysSince(r.created_at))) : 0; // " + MARK + "\n    return { pending: pending.length, late: late.length, published: pub.length, avg, count, oldestDays };",
  "Calcul des statistiques (AdminReviews)"
);
replaceRegexOnce(
  reviews,
  /[ \t]*<div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">[\s\S]*?<\/div>[ \t]*(\n\s*)(?=<div className="flex flex-wrap gap-2 mt-5" role="tablist">)/,
  (m, sep) => [
    "      {/* " + MARK + " : cartes cliquables (En attente / en retard -> En attente ; publiés -> Publiés) */}",
    "      <StatCards",
    '        testId="reviews-cards"',
    '        className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5"',
    "        cards={[",
    '          { key: "pending", value: stats.pending, label: "en attente", sub: stats.pending > 0 ? "le plus ancien : " + stats.oldestDays + " jour" + (stats.oldestDays > 1 ? "s" : "") + " ouvré" + (stats.oldestDays > 1 ? "s" : "") : "", onClick: () => { setFilter("pending"); setRefuseId(null); setReplyId(null); }, active: filter === "pending" },',
    '          { key: "late", value: stats.late, label: `en retard (> ${REVIEWS_RULES.moderationDays} jours ouvrés)`, tone: stats.late > 0 ? "red" : "", onClick: () => { setFilter("pending"); setRefuseId(null); setReplyId(null); } },',
    '          { key: "published", value: stats.published, label: "publiés (hors tests)", onClick: () => { setFilter("published"); setRefuseId(null); setReplyId(null); }, active: filter === "published" },',
    '          { key: "avg", value: stats.avg, label: `note moyenne${stats.avg === "—" ? ` (dès ${REVIEWS_RULES.minReviewsForAverage} avis)` : ""}` },',
    "        ]}",
    "      />",
  ].join("\n") + sep,
  "Bloc des 4 cartes (AdminReviews)",
  ["grid grid-cols-2 md:grid-cols-4 gap-3 mt-5", 'role="tablist"']
);

// ------------------------------------------------------------------
// components/AdminDataRequests.js (RGPD)
// ------------------------------------------------------------------
afterLine(
  data,
  'import { supabase } from "@/lib/supabase";',
  "import StatCards from \"@/components/StatCards\"; // " + MARK + "\nimport { RGPD_LEGAL_DAYS, RGPD_ALERT_DAYS } from \"@/lib/adminCounters\";",
  "Import supabase (AdminDataRequests)"
);
afterLine(
  data,
  'const done = rows.filter((r) => r.status !== "pending");',
  "  // " + MARK + " : ancienneté de la plus ancienne demande en attente (en jours), même règle que l'Accueil\n" +
    "  const oldestDays = pending.length ? Math.max(...pending.map((r) => Math.max(0, Math.floor((Date.now() - new Date(r.requested_at).getTime()) / 86400000)))) : 0;\n" +
    "  const lateRequests = pending.length > 0 && oldestDays >= RGPD_ALERT_DAYS;",
  "Liste done (AdminDataRequests)"
);
replaceRegexOnce(
  data,
  /return \(\s*<div className="rounded-2xl border border-\[#eadfe4\] bg-white p-5">/,
  [
    "return (",
    "    <>",
    "      {/* " + MARK + " : bandeau de chiffres */}",
    "      <StatCards",
    '        testId="rgpd-cards"',
    '        className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5"',
    "        cards={[",
    '          { key: "pending", value: loading ? "—" : pending.length, label: "demandes en attente", tone: lateRequests ? "red" : "" },',
    '          { key: "oldest", value: loading ? "—" : pending.length ? oldestDays + " j" : "—", label: "la plus ancienne (délai : " + RGPD_LEGAL_DAYS + " jours)", tone: lateRequests ? "red" : "" },',
    '          { key: "done", value: loading ? "—" : done.length, label: "demandes traitées" },',
    "        ]}",
    "      />",
    '    <div className="rounded-2xl border border-[#eadfe4] bg-white p-5">',
  ].join("\n"),
  "Ouverture du return (AdminDataRequests)",
  ["return (", "rounded-2xl border border-[#eadfe4] bg-white p-5"]
);
replaceRegexOnce(data, /<\/div>\s*\);\s*\}\s*$/, "</div>\n    </>\n  );\n}\n", "Fin du composant (AdminDataRequests)", ["  );", "}"]);

// ------------------------------------------------------------------
// components/AdminConnections.js
// ------------------------------------------------------------------
afterLine(
  conn,
  'import FlaggedBadge from "@/components/FlaggedBadge";',
  'import StatCards from "@/components/StatCards"; // ' + MARK,
  "Import FlaggedBadge (AdminConnections)"
);
afterLine(
  conn,
  "const flagged = useFlaggedAccounts(accounts); // ZENORIA_FLAGGED_5E_V1",
  "  const [onlyFlagged, setOnlyFlagged] = useState(false); // " + MARK + " : filtre « comptes à surveiller »",
  "Etat flagged (AdminConnections)"
);
beforeLine(
  conn,
  "const cards = [",
  [
    "  // " + MARK,
    "  const flaggedCount = accounts.filter((a) => flagged.has(a.account_id)).length;",
    "  const filterFlagged = onlyFlagged && flaggedCount > 0;",
    "  const shownAccounts = filterFlagged ? accounts.filter((a) => flagged.has(a.account_id)) : accounts;",
  ].join("\n"),
  "Tableau cards (AdminConnections)"
);
replaceRegexOnce(
  conn,
  /[ \t]*<div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">[\s\S]*?<\/div>[ \t]*(\n\s*)(?=\{\/\* Comptes \*\/\})/,
  (m, sep) => [
    "      <StatCards",
    '        testId="connections-cards"',
    '        className={"grid grid-cols-2 gap-3 mb-8 " + (flaggedCount > 0 ? "lg:grid-cols-5" : "lg:grid-cols-4")}',
    "        cards={[",
    '          ...cards.map((c) => ({ key: c.label, value: loading ? "…" : c.value, label: c.label })),',
    '          ...(flaggedCount > 0 ? [{ key: "flagged", value: flaggedCount, label: "Comptes à surveiller", sub: "3 annulations ou plus sur 30 jours", tone: "red", onClick: () => setOnlyFlagged(!filterFlagged), active: filterFlagged }] : []),',
    "        ]}",
    "      />",
  ].join("\n") + sep,
  "Bloc des cartes (AdminConnections)",
  ["grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8", "Comptes */}"]
);
afterLine(
  conn,
  '<h2 className="font-serif text-xl mb-3">Comptes</h2>',
  [
    "      {filterFlagged && (",
    '        <div data-testid="flagged-filter-banner" className="mb-3 flex flex-wrap items-center gap-3 rounded-xl bg-[#f5edf1] px-4 py-2.5 text-[13px] text-[#54434c]">',
    "          <span>",
    "            Filtre : <b>Comptes à surveiller</b> · {shownAccounts.length} compte{shownAccounts.length > 1 ? \"s\" : \"\"}",
    "          </span>",
    '          <button type="button" onClick={() => setOnlyFlagged(false)} data-testid="flagged-filter-clear" className="text-[#8f6075] underline">',
    "            Afficher tous les comptes",
    "          </button>",
    "        </div>",
    "      )}",
  ].join("\n"),
  "Titre Comptes (AdminConnections)"
);
replaceOnce(conn, "{accounts.map((a) => (", "{shownAccounts.map((a) => (", "Liste des comptes (AdminConnections)");

// ------------------------------------------------------------------
// Controles finaux
// ------------------------------------------------------------------
const need = [
  [admin, "pages/admin.js", 2],
  [reviews, "components/AdminReviews.js", 3],
  [data, "components/AdminDataRequests.js", 3],
  [conn, "components/AdminConnections.js", 3],
];
for (const [d, n, min] of need) {
  if (occurrences(d.src, MARK) < min) fail(n + " : marqueur attendu au moins " + min + " fois, trouve " + occurrences(d.src, MARK) + ".");
}
if (occurrences(admin.src, "<StatCards") !== 1) fail("admin.js : StatCards doit etre utilise une seule fois.");
if (occurrences(reviews.src, "<StatCards") !== 1 || occurrences(data.src, "<StatCards") !== 1 || occurrences(conn.src, "<StatCards") !== 1) fail("Un seul <StatCards> attendu par fichier.");
if (occurrences(reviews.src, "cards.map") !== 0) fail("AdminReviews : l'ancien bloc de cartes est encore present.");
if (occurrences(conn.src, "{accounts.map((a) => (") !== 0) fail("AdminConnections : la liste n'utilise pas shownAccounts.");
{
  // AdminDataRequests contenait deja un fragment <> ... </> (liste) : le patch en ajoute un second, les deux doivent rester equilibres
  const o = occurrences(data.src, "<>");
  const c = occurrences(data.src, "</>");
  if (o !== c) fail("AdminDataRequests : fragments <> / </> desequilibres (" + o + " / " + c + ").");
}

const eol = admin.crlf ? "\r\n" : "\n";
console.log("");
console.log("  1. components/StatCards.js (nouveau)                         OK");
console.log("  2. Bijoux : 4 cartes filtrantes (pages/admin.js)             OK");
console.log("  3. Avis : cartes cliquables, le plus ancien                  OK");
console.log("  4. RGPD : 3 cartes (en attente, plus ancienne, traitees)     OK");
console.log("  5. Connexions : carte rouge « Comptes a surveiller » + filtre OK");
docs.forEach((d, i) => console.log("  Lignes " + names[i] + " : " + before[i] + " -> " + d.src.split("\n").length));

if (apply) {
  fs.writeFileSync(F_CARDS, CARDS.replace(/\n/g, eol), "utf8");
  fs.writeFileSync(F_ADMIN, serialize(admin), "utf8");
  fs.writeFileSync(F_REVIEWS, serialize(reviews), "utf8");
  fs.writeFileSync(F_DATA, serialize(data), "utf8");
  fs.writeFileSync(F_CONN, serialize(conn), "utf8");
  console.log("\nEcrit : components/StatCards.js, pages/admin.js, components/AdminReviews.js, components/AdminDataRequests.js, components/AdminConnections.js");
  console.log("Prochaine etape : npm run build");
} else {
  console.log("\nDRY-RUN termine : rien n'a ete ecrit. Relancez avec --apply.");
}
