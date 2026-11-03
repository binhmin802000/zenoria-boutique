// patch-lot5e-signalement.mjs
// Lot 5e-2 : signalement des comptes « à surveiller » (3 annulations ou plus par la cliente sur 30 jours).
// À appliquer APRES l'exécution de supabase_lot5e_1_flagged_accounts.sql dans Supabase.
//
//   - crée lib/flaggedAccounts.js            (appel de admin_flagged_accounts() + hook useFlaggedAccounts)
//   - crée components/FlaggedBadge.js        (pastille rouge « À surveiller · N annul. »)
//   - components/AdminCrm.js :
//       Comptes   : bandeau rouge + pastille à côté de l'e-mail
//       Commandes : pastille à côté de « Compte client » + encart rouge dans le détail de la commande
//   - components/AdminConnections.js : pastille à côté de l'e-mail dans la liste des comptes
//
// Si la fonction SQL n'est pas installée, rien n'est signalé et rien ne casse (résultat vide).
//
// Usage :  node scripts/patch-lot5e-signalement.mjs --dry-run
//          node scripts/patch-lot5e-signalement.mjs --apply
// Marqueur : ZENORIA_FLAGGED_5E_V1 (le script est idempotent)

import fs from "node:fs";
import path from "node:path";

const MARK = "ZENORIA_FLAGGED_5E_V1";
const ROOT = process.cwd();
const F_CRM = path.join(ROOT, "components", "AdminCrm.js");
const F_CONN = path.join(ROOT, "components", "AdminConnections.js");
const F_LIB = path.join(ROOT, "lib", "flaggedAccounts.js");
const F_BADGE = path.join(ROOT, "components", "FlaggedBadge.js");
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const dry = args.includes("--dry-run");

if (apply === dry) {
  console.error("Usage : node scripts/patch-lot5e-signalement.mjs --dry-run | --apply");
  process.exit(1);
}
console.log("Mode : " + (apply ? "APPLY (ecriture)" : "DRY-RUN (aucune ecriture)"));

function fail(msg) {
  console.error("ECHEC : " + msg);
  console.error("Aucune modification n'a ete ecrite.");
  process.exit(1);
}

for (const f of [F_CRM, F_CONN]) {
  if (!fs.existsSync(f)) fail(path.relative(ROOT, f) + " introuvable (lancez le script depuis la racine du projet).");
}

function readSrc(file) {
  const raw = fs.readFileSync(file, "utf8");
  return {
    bom: raw.charCodeAt(0) === 0xfeff,
    crlf: raw.includes("\r\n"),
    src: (raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw).replace(/\r\n/g, "\n"),
  };
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
// Remplace une ligne (repérée par un morceau unique) en la conservant et en ajoutant du texte après elle
function afterLine(doc, needle, addition, label) {
  const n = occurrences(doc.src, needle);
  if (n !== 1) fail(label + " : " + n + " occurrence(s) trouvee(s) au lieu de 1.");
  const idx = doc.src.indexOf(needle);
  const eol = doc.src.indexOf("\n", idx);
  const end = eol < 0 ? doc.src.length : eol;
  doc.src = doc.src.slice(0, end) + "\n" + addition + doc.src.slice(end);
}
// Insere du texte juste avant la ligne qui contient le morceau unique
function beforeLine(doc, needle, addition, label) {
  const n = occurrences(doc.src, needle);
  if (n !== 1) fail(label + " : " + n + " occurrence(s) trouvee(s) au lieu de 1.");
  const idx = doc.src.indexOf(needle);
  const start = doc.src.lastIndexOf("\n", idx) + 1;
  doc.src = doc.src.slice(0, start) + addition + "\n" + doc.src.slice(start);
}
// Ajoute du texte juste après un morceau unique (sur la même ligne)
function afterText(doc, needle, addition, label) {
  const n = occurrences(doc.src, needle);
  if (n !== 1) fail(label + " : " + n + " occurrence(s) trouvee(s) au lieu de 1.");
  const idx = doc.src.indexOf(needle) + needle.length;
  doc.src = doc.src.slice(0, idx) + addition + doc.src.slice(idx);
}

const crm = readSrc(F_CRM);
const conn = readSrc(F_CONN);
const crmDone = crm.src.includes(MARK);
const connDone = conn.src.includes(MARK);
if (crmDone && connDone && fs.existsSync(F_LIB) && fs.existsSync(F_BADGE)) {
  console.log("Deja applique (" + MARK + " present). Rien a faire.");
  process.exit(0);
}
if (crmDone !== connDone) fail("Etat incoherent : le marqueur n'est present que dans un des deux fichiers. Restaurez-les (git checkout) puis relancez.");
if (fs.existsSync(F_LIB) || fs.existsSync(F_BADGE)) fail("lib/flaggedAccounts.js ou components/FlaggedBadge.js existe deja sans que les fichiers soient patches.");
console.log("components/AdminCrm.js (fins de ligne " + (crm.crlf ? "Windows CRLF" : "LF") + ")");
console.log("components/AdminConnections.js (fins de ligne " + (conn.crlf ? "Windows CRLF" : "LF") + ")");
const crmLinesBefore = crm.src.split("\n").length;
const connLinesBefore = conn.src.split("\n").length;

// ------------------------------------------------------------------
// Nouveaux fichiers
// ------------------------------------------------------------------
const LIB = `// ${MARK} : comptes « à surveiller » = 3 annulations ou plus faites par la cliente sur 30 jours glissants.
// La règle est calculée côté base par la fonction SQL admin_flagged_accounts() (réservée aux administrateurs).
// Si la fonction n'est pas installée ou si l'appel échoue, aucun compte n'est signalé : l'écran continue de fonctionner.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export const FLAG_THRESHOLD = 3;
export const FLAG_WINDOW_DAYS = 30;

// Renvoie une Map : account_id -> { count, last }
export async function loadFlaggedAccounts() {
  try {
    const { data, error } = await supabase.rpc("admin_flagged_accounts");
    if (error || !Array.isArray(data)) return new Map();
    return new Map(data.map((r) => [r.account_id, { count: Number(r.cancellations) || 0, last: r.last_cancelled_at }]));
  } catch (e) {
    return new Map();
  }
}

// refreshKey : toute valeur qui change quand l'écran recharge ses données (le signalement est alors relu)
export function useFlaggedAccounts(refreshKey) {
  const [flagged, setFlagged] = useState(() => new Map());
  useEffect(() => {
    let alive = true;
    loadFlaggedAccounts().then((m) => {
      if (alive) setFlagged(m);
    });
    return () => {
      alive = false;
    };
  }, [refreshKey]);
  return flagged;
}
`;
const BADGE = `// ${MARK} : pastille rouge d'un compte à surveiller
import React from "react";

export default function FlaggedBadge({ count }) {
  const n = Number(count) || 0;
  return (
    <span
      data-testid="flagged-badge"
      title={n + " annulations par la cliente sur les 30 derniers jours"}
      className="ml-2 inline-block rounded-full bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 text-[11px] font-medium whitespace-nowrap align-middle"
    >
      À surveiller · {n} annul.
    </span>
  );
}
`;

// ------------------------------------------------------------------
// AdminCrm.js
// ------------------------------------------------------------------
afterLine(
  crm,
  'import { parisDay, parisDayDiff, addDaysToParisDay } from "@/lib/dates";',
  "// " + MARK + " : signalement des comptes à 3 annulations par la cliente sur 30 jours\n" +
    'import { useFlaggedAccounts } from "@/lib/flaggedAccounts";\nimport FlaggedBadge from "@/components/FlaggedBadge";',
  "Import lib/dates"
);

// Comptes : hook, bandeau, pastille
afterLine(
  crm,
  "const [includeAdmins, setIncludeAdmins] = useState(false);",
  "  const flagged = useFlaggedAccounts(accounts); // " + MARK,
  "Etat includeAdmins (CrmAccounts)"
);
beforeLine(
  crm,
  '<div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">',
  `      {/* ${MARK} : comptes à surveiller */}
      {customers.some((a) => flagged.has(a.account_id)) && (
        <div data-testid="flagged-banner" role="status" className="mb-5 rounded-xl bg-red-50 border border-red-200 text-red-800 px-4 py-3 text-[13px]">
          {customers.filter((a) => flagged.has(a.account_id)).length} compte{customers.filter((a) => flagged.has(a.account_id)).length > 1 ? "s" : ""} à surveiller : 3 annulations ou plus faites par la cliente sur les 30 derniers jours.
        </div>
      )}`,
  "Grille des cartes (CrmAccounts)"
);
afterText(
  crm,
  '{a.is_admin_account && <span className="ml-2 rounded-full bg-[#f5edf1] text-[#8f6075] px-2 py-0.5 text-[11px]">Admin</span>}',
  "\n                  {flagged.get(a.account_id) && <FlaggedBadge count={flagged.get(a.account_id).count} />}",
  "Pastille Admin (CrmAccounts)"
);

// Commandes : hook, pastille dans la liste, encart dans le détail
afterLine(
  crm,
  'const [statusFilter, setStatusFilter] = useState("all"); // ZENORIA_ORDERS_5B_V1',
  "  const flaggedAccounts = useFlaggedAccounts(orders); // " + MARK,
  "Etat statusFilter (AdminOrders)"
);
afterText(
  crm,
  '<span className="font-medium whitespace-nowrap">{o.guest_email || "Compte client"}</span>',
  "\n                    {o.user_id && flaggedAccounts.get(o.user_id) && <FlaggedBadge count={flaggedAccounts.get(o.user_id).count} />}",
  "Cellule cliente (AdminOrders)"
);
beforeLine(
  crm,
  "<TransferPanel order={o} history={statusHistoryByOrder[o.id]}",
  `                      {o.user_id && flaggedAccounts.get(o.user_id) && (
                        <div data-testid="flagged-order-note" className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-800 text-[12px] px-3 py-2">
                          Compte à surveiller : {flaggedAccounts.get(o.user_id).count} annulations par la cliente sur les 30 derniers jours.
                        </div>
                      )}`,
  "TransferPanel (AdminOrders)"
);

// ------------------------------------------------------------------
// AdminConnections.js
// ------------------------------------------------------------------
afterLine(
  conn,
  'import { supabase } from "@/lib/supabase";',
  "// " + MARK + " : signalement des comptes à 3 annulations par la cliente sur 30 jours\n" +
    'import { useFlaggedAccounts } from "@/lib/flaggedAccounts";\nimport FlaggedBadge from "@/components/FlaggedBadge";',
  "Import supabase (AdminConnections)"
);
afterLine(
  conn,
  "const [maxRows, setMaxRows] = useState(50);",
  "  const flagged = useFlaggedAccounts(accounts); // " + MARK,
  "Etat maxRows (AdminConnections)"
);
afterText(
  conn,
  '<span className="font-medium whitespace-nowrap">{a.email || "—"}</span>',
  "\n                    {flagged.get(a.account_id) && <FlaggedBadge count={flagged.get(a.account_id).count} />}",
  "Cellule e-mail (AdminConnections)"
);

// ------------------------------------------------------------------
// Controles finaux
// ------------------------------------------------------------------
for (const [doc, name, minMarks] of [[crm, "AdminCrm.js", 4], [conn, "AdminConnections.js", 2]]) {
  if (occurrences(doc.src, MARK) < minMarks) fail(name + " : marqueur attendu au moins " + minMarks + " fois, trouve " + occurrences(doc.src, MARK) + ".");
}
if (occurrences(crm.src, "<FlaggedBadge") !== 2) fail("AdminCrm.js : FlaggedBadge doit etre utilise 2 fois.");
if (occurrences(crm.src, "useFlaggedAccounts(") !== 2) fail("AdminCrm.js : useFlaggedAccounts doit etre appele 2 fois.");
if (occurrences(conn.src, "<FlaggedBadge") !== 1 || occurrences(conn.src, "useFlaggedAccounts(") !== 1) fail("AdminConnections.js : un seul usage attendu.");
if (occurrences(crm.src, 'import FlaggedBadge from "@/components/FlaggedBadge";') !== 1) fail("AdminCrm.js : import FlaggedBadge duplique ou absent.");

const eol = crm.crlf ? "\r\n" : "\n";
const toEol = (s) => s.replace(/\n/g, eol);
console.log("");
console.log("  1. lib/flaggedAccounts.js (nouveau)                          OK");
console.log("  2. components/FlaggedBadge.js (nouveau)                      OK");
console.log("  3. AdminCrm.js : Comptes (bandeau + pastille)                OK");
console.log("  4. AdminCrm.js : Commandes (liste + detail)                  OK");
console.log("  5. AdminConnections.js : pastille                            OK");
console.log("  Lignes AdminCrm.js : " + crmLinesBefore + " -> " + crm.src.split("\n").length);
console.log("  Lignes AdminConnections.js : " + connLinesBefore + " -> " + conn.src.split("\n").length);

if (apply) {
  fs.writeFileSync(F_LIB, toEol(LIB), "utf8");
  fs.writeFileSync(F_BADGE, toEol(BADGE), "utf8");
  fs.writeFileSync(F_CRM, serialize(crm), "utf8");
  fs.writeFileSync(F_CONN, serialize(conn), "utf8");
  console.log("\nEcrit : lib/flaggedAccounts.js, components/FlaggedBadge.js, components/AdminCrm.js, components/AdminConnections.js");
  console.log("Prochaine etape : npm run build");
} else {
  console.log("\nDRY-RUN termine : rien n'a ete ecrit. Relancez avec --apply.");
}
