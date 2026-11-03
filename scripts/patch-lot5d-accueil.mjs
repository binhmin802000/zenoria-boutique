// patch-lot5d-accueil.mjs
// Lot 5d : Accueil de l'administration (tableau de bord) et compteurs du menu. Sans SQL.
//
//   - crée lib/adminCounters.js        (chargement des compteurs + hook useAdminCounters + passage de filtre vers Commandes)
//   - crée components/AdminHome.js     (tableau de bord : À faire maintenant, État du stock, Mois en cours)
//   - lib/adminNav.js                  : groupe « Accueil » en premier, page d'ouverture, #crm/avenir -> Accueil
//   - pages/admin.js                   : icônes, compteurs du menu (groupes Accueil et CRM, onglets Commandes, Avis, Comptes), rendu de l'Accueil,
//                                        compteur RGPD chargé dès l'ouverture (avant, il restait à 0 tant que l'onglet RGPD n'était pas ouvert)
//   - components/AdminCrm.js           : AdminOrders s'ouvre avec le filtre choisi depuis l'Accueil (2 lignes d'état + 1 import)
//
// Les chiffres reprennent les règles des écrans existants (alerte de virement = isAutoCancelAlert, avis en retard = jours ouvrés, etc.).
// Si une requête échoue, le compteur concerné reste à 0 et l'Accueil l'indique : rien ne casse.
//
// Usage :  node scripts/patch-lot5d-accueil.mjs --dry-run
//          node scripts/patch-lot5d-accueil.mjs --apply
// Marqueur : ZENORIA_HOME_5D_V1 (le script est idempotent)

import fs from "node:fs";
import path from "node:path";

const MARK = "ZENORIA_HOME_5D_V1";
const ROOT = process.cwd();
const F_NAV = path.join(ROOT, "lib", "adminNav.js");
const F_ADMIN = path.join(ROOT, "pages", "admin.js");
const F_CRM = path.join(ROOT, "components", "AdminCrm.js");
const F_COUNTERS = path.join(ROOT, "lib", "adminCounters.js");
const F_HOME = path.join(ROOT, "components", "AdminHome.js");
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const dry = args.includes("--dry-run");

if (apply === dry) {
  console.error("Usage : node scripts/patch-lot5d-accueil.mjs --dry-run | --apply");
  process.exit(1);
}
console.log("Mode : " + (apply ? "APPLY (ecriture)" : "DRY-RUN (aucune ecriture)"));

function fail(msg) {
  console.error("ECHEC : " + msg);
  console.error("Aucune modification n'a ete ecrite.");
  process.exit(1);
}

for (const f of [F_NAV, F_ADMIN, F_CRM]) {
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
// Remplace un morceau unique par un autre
function replaceOnce(doc, needle, replacement, label) {
  once(doc, needle, label);
  doc.src = doc.src.replace(needle, () => replacement);
}
// Ajoute des lignes juste apres la ligne qui contient le morceau unique
function afterLine(doc, needle, addition, label) {
  once(doc, needle, label);
  const idx = doc.src.indexOf(needle);
  const eol = doc.src.indexOf("\n", idx);
  const end = eol < 0 ? doc.src.length : eol;
  doc.src = doc.src.slice(0, end) + "\n" + addition + doc.src.slice(end);
}
// Ajoute des lignes juste avant la ligne qui contient le morceau unique
function beforeLine(doc, needle, addition, label) {
  once(doc, needle, label);
  const idx = doc.src.indexOf(needle);
  const start = doc.src.lastIndexOf("\n", idx) + 1;
  doc.src = doc.src.slice(0, start) + addition + "\n" + doc.src.slice(start);
}

const nav = readSrc(F_NAV);
const admin = readSrc(F_ADMIN);
const crm = readSrc(F_CRM);
const done = [nav, admin, crm].map((d) => d.src.includes(MARK));
if (done.every(Boolean) && fs.existsSync(F_COUNTERS) && fs.existsSync(F_HOME)) {
  console.log("Deja applique (" + MARK + " present). Rien a faire.");
  process.exit(0);
}
if (done.some(Boolean)) fail("Etat incoherent : le marqueur n'est present que dans une partie des fichiers. Restaurez-les (git checkout) puis relancez.");
if (fs.existsSync(F_COUNTERS) || fs.existsSync(F_HOME)) fail("lib/adminCounters.js ou components/AdminHome.js existe deja sans que les fichiers soient patches.");
for (const [d, n] of [[nav, "lib/adminNav.js"], [admin, "pages/admin.js"], [crm, "components/AdminCrm.js"]]) {
  console.log(n + " (fins de ligne " + (d.crlf ? "Windows CRLF" : "LF") + ")");
}
const before = { nav: nav.src.split("\n").length, admin: admin.src.split("\n").length, crm: crm.src.split("\n").length };

// ------------------------------------------------------------------
// Nouveaux fichiers
// ------------------------------------------------------------------
const COUNTERS = String.raw`// ZENORIA_HOME_5D_V1 : compteurs du tableau de bord (Accueil) et du menu de l'administration.
// Chaque compteur reprend la règle de l'écran qui le détaille, pour que les chiffres soient les mêmes partout :
//  - virement en alerte : même règle que CRM > Commandes (isAutoCancelAlert + délai de grâce de Moyens de paiement)
//  - avis en retard     : même règle que CRM > Avis (jours ouvrés, REVIEWS_RULES.moderationDays)
//  - demandes RGPD      : demandes de la table data_requests au statut « pending »
//  - stock              : colonne stock des bijoux en ligne ; pièces uniques = réservations (product_holds)
// Une requête qui échoue laisse son compteur à 0 et est listée dans « failed » : l'Accueil l'indique, rien ne casse.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { BANK_TRANSFER_KEY, parseBankTransfer, autoCancelAt, isAutoCancelAlert } from "@/lib/paymentSettings";
import { pieceStateFor } from "@/lib/pieceLock";
import { REVIEWS_RULES } from "@/lib/reviewsSettings";
import { loadFlaggedAccounts } from "@/lib/flaggedAccounts";
import { parisDay } from "@/lib/dates";

// Toutes les données actuelles sont des tests : on les compte, comme pour le signalement des comptes (lot 5e).
// À passer à false avec la purge des données de test (étape 7).
export const COUNT_TEST_DATA = true;
// Délai légal de réponse à une demande RGPD (un mois) et seuil à partir duquel la demande passe en rouge.
export const RGPD_LEGAL_DAYS = 30;
export const RGPD_ALERT_DAYS = 25;

// --- Passage d'un filtre de l'Accueil vers CRM > Commandes (lu une seule fois par AdminOrders à l'ouverture) ---
let ordersHandoff = null;
export function setOrdersHandoff(value) {
  ordersHandoff = value || null;
}
export function peekOrdersHandoff() {
  return ordersHandoff;
}
export function clearOrdersHandoff() {
  ordersHandoff = null;
}

export const EMPTY_COUNTERS = {
  loaded: false,
  failed: [],
  orders: { alert: 0, waiting: 0, waitingTransfer: 0, toShip: 0, open: 0, menu: 0, nextCancel: null },
  reviews: { pending: 0, late: 0, oldestDays: 0, limit: REVIEWS_RULES.moderationDays },
  rgpd: { count: 0, oldestDays: 0 },
  flagged: { count: 0 },
  stock: { known: false, uniqueKnown: false, out: 0, last: 0, uniqueReserved: 0, uniqueAvailable: 0, uniqueSold: 0 },
  month: { label: "", revenue: 0, count: 0, average: 0 },
  todoTotal: 0,
  urgent: false,
};

// Jours ouvrés (lundi à vendredi) écoulés depuis une date : même calcul que l'écran Avis
function businessDaysSince(value) {
  const start = new Date(value);
  const end = new Date();
  let n = 0;
  const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
  while (d <= end) {
    const w = d.getDay();
    if (w !== 0 && w !== 6) n += 1;
    d.setDate(d.getDate() + 1);
  }
  return n;
}
function daysSince(value) {
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}

async function safe(label, run, failed) {
  try {
    const res = await run();
    if (!res || res.error) {
      failed.push(label);
      return null;
    }
    return res;
  } catch (e) {
    failed.push(label);
    return null;
  }
}

export async function loadAdminCounters() {
  const failed = [];
  const [ordersRes, bankRes, reviewsRes, rgpdRes, productsRes, holdsRes, flaggedMap] = await Promise.all([
    safe("commandes", () => supabase.from("orders").select("id, status, transfer_due_at, is_test, paid_at, total"), failed),
    (async () => {
      try {
        return await supabase.from("site_settings").select("value").eq("key", BANK_TRANSFER_KEY).maybeSingle();
      } catch (e) {
        return null;
      }
    })(),
    safe("avis", () => supabase.from("reviews").select("id, status, created_at").eq("status", "pending"), failed),
    safe("demandes RGPD", () => supabase.from("data_requests").select("id, status, requested_at").eq("status", "pending"), failed),
    safe("stock", () => supabase.from("products").select("id, stock, active, is_unique"), failed),
    safe("réservations", () => supabase.from("product_holds").select("product_id, order_id, status, expires_at").in("status", ["active", "consumed"]), failed),
    loadFlaggedAccounts(),
  ]);

  const graceDays = parseBankTransfer(bankRes && !bankRes.error && bankRes.data ? bankRes.data.value : null).grace_days;

  // --- Commandes ---
  const orders = ((ordersRes && ordersRes.data) || []).filter((o) => COUNT_TEST_DATA || !o.is_test);
  const transfers = orders.filter((o) => o.status === "pending_transfer");
  const alerts = transfers.filter((o) => isAutoCancelAlert(o.transfer_due_at, graceDays));
  let nextCancel = null;
  let nextTime = Infinity;
  alerts.forEach((o) => {
    const raw = autoCancelAt(o.transfer_due_at, graceDays);
    const t = raw ? new Date(raw).getTime() : NaN;
    if (!Number.isNaN(t) && t < nextTime) {
      nextTime = t;
      nextCancel = raw;
    }
  });
  const toShip = orders.filter((o) => o.status === "paid").length;
  const ordersOut = {
    alert: alerts.length,
    waiting: orders.filter((o) => o.status === "pending_transfer" || o.status === "pending").length,
    waitingTransfer: transfers.length,
    toShip,
    open: orders.filter((o) => ["pending_transfer", "paid", "shipped"].includes(o.status)).length,
    menu: alerts.length + toShip,
    nextCancel,
  };

  // --- Mois en cours (date d'encaissement, jour de Paris) ---
  const monthKey = parisDay(new Date()).slice(0, 7);
  const cashed = orders.filter((o) => ["paid", "shipped", "delivered"].includes(o.status) && o.paid_at && parisDay(o.paid_at).slice(0, 7) === monthKey);
  const revenue = cashed.reduce((s, o) => s + Number(o.total || 0), 0);
  const month = {
    label: new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "Europe/Paris" }),
    revenue,
    count: cashed.length,
    average: cashed.length ? revenue / cashed.length : 0,
  };

  // --- Avis et RGPD ---
  const pendingReviews = (reviewsRes && reviewsRes.data) || [];
  const ages = pendingReviews.map((r) => businessDaysSince(r.created_at));
  const reviews = {
    pending: pendingReviews.length,
    late: ages.filter((n) => n > REVIEWS_RULES.moderationDays).length,
    oldestDays: ages.length ? Math.max(...ages) : 0,
    limit: REVIEWS_RULES.moderationDays,
  };
  const pendingRequests = (rgpdRes && rgpdRes.data) || [];
  const rgpd = {
    count: pendingRequests.length,
    oldestDays: pendingRequests.length ? Math.max(...pendingRequests.map((r) => daysSince(r.requested_at))) : 0,
  };

  // --- Stock : uniquement les bijoux en ligne ---
  const products = ((productsRes && productsRes.data) || []).filter((p) => p.active === true);
  const holds = (holdsRes && holdsRes.data) || [];
  const normal = products.filter((p) => p.is_unique !== true);
  const unique = products.filter((p) => p.is_unique === true);
  const states = unique.map((p) => pieceStateFor(p.id, holds).state);
  const stock = {
    known: Boolean(productsRes),
    uniqueKnown: Boolean(productsRes) && Boolean(holdsRes),
    out: normal.filter((p) => (Number(p.stock) || 0) <= 0).length,
    last: normal.filter((p) => (Number(p.stock) || 0) === 1).length,
    uniqueReserved: states.filter((s) => s === "reserved").length,
    uniqueAvailable: states.filter((s) => s === "available").length,
    uniqueSold: states.filter((s) => s === "sold").length,
  };

  const todoTotal = ordersOut.menu + reviews.pending + rgpd.count;
  return {
    loaded: true,
    failed,
    orders: ordersOut,
    reviews,
    rgpd,
    flagged: { count: flaggedMap ? flaggedMap.size : 0 },
    stock,
    month,
    todoTotal,
    urgent: ordersOut.alert > 0 || reviews.late > 0 || (rgpd.count > 0 && rgpd.oldestDays >= RGPD_ALERT_DAYS),
  };
}

// refreshKey : toute valeur qui change quand il faut relire les compteurs (par exemple l'onglet affiché)
export function useAdminCounters(enabled, refreshKey) {
  const [state, setState] = useState(EMPTY_COUNTERS);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    loadAdminCounters().then((c) => {
      if (alive) setState(c);
    });
    return () => {
      alive = false;
    };
  }, [enabled, refreshKey, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
`;

const HOME = String.raw`// ZENORIA_HOME_5D_V1 : Accueil de l'administration (tableau de bord).
// Lecture seule : les chiffres viennent de lib/adminCounters.js. Un clic sur une tuile ouvre l'écran qui la détaille
// (CRM > Commandes s'ouvre avec le filtre correspondant).
import React from "react";
import { RefreshCw } from "lucide-react";
import { formatOrderPrice } from "@/lib/orderDisplay";
import { formatAutoCancel } from "@/lib/paymentSettings";
import { COUNT_TEST_DATA, RGPD_LEGAL_DAYS, RGPD_ALERT_DAYS, setOrdersHandoff } from "@/lib/adminCounters";

function Tile({ testId, value, label, sub, tone, zero, zeroText, onClick, loaded }) {
  const border = tone === "red" ? "border-l-red-500" : tone === "amber" ? "border-l-amber-500" : "border-l-[#d9c5cc]";
  const numColor = !zero && tone === "red" ? "text-red-600" : !zero && tone === "amber" ? "text-amber-700" : "text-[#412f3b]";
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={"text-left w-full min-w-0 rounded-2xl bg-white border border-[#eee2e5] border-l-4 px-4 py-3 hover:shadow-sm transition " + border + (loaded && zero ? " opacity-60" : "")}
    >
      <div className={"font-serif text-3xl leading-tight " + numColor}>{loaded ? value : "—"}</div>
      <div className="text-xs text-[#54434c] mt-1">{label}</div>
      {loaded && (
        <div className={"text-[11px] mt-1 " + (!zero && tone === "red" ? "text-red-600 font-medium" : "text-[#8b737e]")}>{zero ? zeroText || "Rien à traiter" : sub}</div>
      )}
    </button>
  );
}

function Figure({ value, label, testId }) {
  return (
    <div className="rounded-2xl bg-white border border-[#eee2e5] px-4 py-3" data-testid={testId}>
      <div className="font-serif text-2xl text-[#8f6075]">{value}</div>
      <div className="text-xs text-[#756a70] mt-1">{label}</div>
    </div>
  );
}

export default function AdminHome({ counters, onGo }) {
  const c = counters;
  const loaded = c.loaded;
  const goOrders = (filter) => {
    setOrdersHandoff({ filter, includeTest: COUNT_TEST_DATA });
    onGo("crm", "commandes");
  };
  const plural = (n, one, many) => n + " " + (n > 1 ? many : one);
  const o = c.orders;
  const s = c.stock;

  const todo = [
    {
      key: "alert",
      value: o.alert,
      label: "Virements en alerte",
      sub: o.nextCancel ? "annulation la plus proche : " + formatAutoCancel(o.nextCancel) : "annulation automatique proche",
      tone: "red",
      onClick: () => goOrders("alert"),
    },
    {
      key: "waiting",
      value: o.waiting,
      label: "En attente de paiement",
      sub: plural(o.waitingTransfer, "virement", "virements") + " à vérifier sur le compte",
      tone: "",
      onClick: () => goOrders("waiting"),
    },
    {
      key: "ship",
      value: o.toShip,
      label: "Payées, à expédier",
      sub: "à préparer et à expédier",
      tone: "amber",
      onClick: () => goOrders("paid"),
    },
    {
      key: "reviews",
      value: c.reviews.pending,
      label: "Avis à modérer",
      sub: c.reviews.late > 0 ? c.reviews.late + " en retard (délai : " + c.reviews.limit + " jours ouvrés)" : "le plus ancien : " + plural(c.reviews.oldestDays, "jour ouvré", "jours ouvrés"),
      tone: c.reviews.late > 0 ? "red" : "",
      onClick: () => onGo("crm", "avis"),
    },
    {
      key: "rgpd",
      value: c.rgpd.count,
      label: "Demandes RGPD",
      sub: "la plus ancienne : " + c.rgpd.oldestDays + " j sur " + RGPD_LEGAL_DAYS,
      tone: c.rgpd.oldestDays >= RGPD_ALERT_DAYS ? "red" : "",
      onClick: () => onGo("crm", "rgpd"),
    },
    {
      key: "flagged",
      value: c.flagged.count,
      label: "Compte à surveiller",
      sub: "3 annulations ou plus par la cliente sur 30 jours",
      tone: "red",
      onClick: () => onGo("crm", "comptes"),
    },
  ];

  const uniqueText = s.uniqueKnown ? s.uniqueAvailable + " / " + s.uniqueSold : "—";
  const stockTiles = [
    { key: "out", value: s.known ? s.out : "—", zero: s.known && s.out === 0, label: "Bijoux épuisés", sub: "visibles sur le site, stock à 0", tone: "red" },
    { key: "last", value: s.known ? s.last : "—", zero: s.known && s.last === 0, label: "Dernier exemplaire", sub: "stock à 1", tone: "amber" },
    { key: "reserved", value: s.uniqueKnown ? s.uniqueReserved : "—", zero: s.uniqueKnown && s.uniqueReserved === 0, label: "Pièces uniques réservées", sub: "en cours de commande", tone: "" },
    { key: "unique", value: uniqueText, zero: false, label: "Pièces uniques (disponibles / vendues)", sub: "bijoux en ligne", tone: "" },
  ];

  return (
    <div data-testid="admin-home">
      <div className="flex justify-between items-center mb-5 gap-3">
        <div>
          <h1 className="font-serif text-2xl">Tableau de bord</h1>
          <p className="text-sm text-[#8b737e]">Ce qui demande votre attention, l&apos;état du stock et le mois en cours</p>
        </div>
        <button
          type="button"
          onClick={c.reload}
          data-testid="home-refresh"
          className="flex items-center gap-1.5 rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] px-4 h-10 text-sm"
        >
          <RefreshCw size={15} className={loaded ? "" : "animate-spin"} /> Actualiser
        </button>
      </div>

      {loaded && c.failed.length > 0 && (
        <div role="alert" data-testid="home-failed" className="mb-5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 text-[13px]">
          Certains chiffres n&apos;ont pas pu être chargés ({c.failed.join(", ")}). Cliquez sur « Actualiser » ou ouvrez l&apos;écran concerné.
        </div>
      )}

      <h2 className="text-sm font-medium text-[#412f3b] mb-2">À faire maintenant</h2>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-7" data-testid="home-todo">
        {todo.map((t) => (
          <Tile key={t.key} testId={"home-todo-" + t.key} value={t.value} label={t.label} sub={t.sub} tone={t.tone} zero={t.value === 0} onClick={t.onClick} loaded={loaded} />
        ))}
      </div>

      <h2 className="text-sm font-medium text-[#412f3b] mb-2">État du stock</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-2" data-testid="home-stock">
        {stockTiles.map((t) => (
          <Tile
            key={t.key}
            testId={"home-stock-" + t.key}
            value={t.value}
            label={t.label}
            sub={t.sub}
            tone={t.tone}
            zero={t.zero}
            zeroText="Aucun"
            onClick={() => onGo("produits", "collections")}
            loaded={loaded}
          />
        ))}
      </div>
      <p className="text-[11px] leading-4 text-[#8b737e] mb-7">
        Seuls les bijoux visibles sur le site sont comptés. Les pièces uniques se lisent dans leurs réservations ; l&apos;état des autres bijoux vient de la colonne stock.
      </p>

      <h2 className="text-sm font-medium text-[#412f3b] mb-2">Mois en cours{loaded && c.month.label ? " : " + c.month.label : ""}</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4" data-testid="home-month">
        <Figure testId="home-month-revenue" value={loaded ? formatOrderPrice(c.month.revenue) : "—"} label="chiffre d'affaires encaissé" />
        <Figure testId="home-month-count" value={loaded ? c.month.count : "—"} label="commandes encaissées" />
        <Figure testId="home-month-average" value={loaded ? (c.month.count ? formatOrderPrice(c.month.average) : "—") : "—"} label="panier moyen" />
        <Figure testId="home-month-open" value={loaded ? o.open : "—"} label="commandes en cours" />
      </div>
      <p className="text-[11px] leading-4 text-[#8b737e]">
        Chiffre d&apos;affaires à la date d&apos;encaissement (jour de Paris).
        {COUNT_TEST_DATA ? " Les commandes de test sont comprises dans tous ces chiffres, tant que la purge des données de test n'est pas faite." : ""}
      </p>
    </div>
  );
}
`;

// ------------------------------------------------------------------
// lib/adminNav.js
// ------------------------------------------------------------------
replaceOnce(
  nav,
  "// Quatre groupes, chacun avec ses onglets (ZENORIA_ADMIN_NAV_5A_V1) :",
  "// Cinq groupes (" + MARK + " : Accueil en premier), chacun avec ses onglets (ZENORIA_ADMIN_NAV_5A_V1) :\n//   Accueil   : Tableau de bord",
  "Commentaire d'en-tete (Quatre groupes)"
);
replaceOnce(
  nav,
  "export const ADMIN_NAV = [\n",
  "export const ADMIN_NAV = [\n  // " + MARK + " : groupe Accueil (tableau de bord), affiché en premier\n  {\n    id: \"accueil\",\n    label: \"Accueil\",\n    tabs: [{ id: \"tableau\", label: \"Tableau de bord\" }],\n  },\n",
  "ADMIN_NAV"
);
replaceOnce(
  nav,
  'export const DEFAULT_NAV = { group: "produits", sub: "collections" };',
  'export const DEFAULT_NAV = { group: "accueil", sub: "tableau" }; // ' + MARK + " : l'Accueil est la page d'ouverture",
  "DEFAULT_NAV"
);
afterLine(
  nav,
  'const [first, second] = raw.split("/");',
  "  // " + MARK + " : l'ancien onglet « À venir » (supprimé au lot 5a) ouvre désormais l'Accueil\n" +
    '  if (first === "avenir" || (first === "crm" && second === "avenir")) return { group: "accueil", sub: "tableau" };',
  "parseAdminHash"
);

// ------------------------------------------------------------------
// pages/admin.js
// ------------------------------------------------------------------
afterLine(
  admin,
  'import { Star as ReviewsTabIcon } from "lucide-react";',
  "// " + MARK + " : Accueil (tableau de bord) et compteurs du menu\n" +
    'import { Home as HomeIcon, LayoutDashboard } from "lucide-react";\n' +
    'import AdminHome from "@/components/AdminHome";\n' +
    'import { useAdminCounters } from "@/lib/adminCounters";',
  "Import Star (ReviewsTabIcon)"
);
replaceOnce(
  admin,
  "const GROUP_ICONS = { produits: Package, crm: Users, reglages: SlidersHorizontal, technique: Settings };",
  "const GROUP_ICONS = { accueil: HomeIcon, produits: Package, crm: Users, reglages: SlidersHorizontal, technique: Settings }; // " + MARK,
  "GROUP_ICONS"
);
afterLine(admin, "const TAB_ICONS = {", "  tableau: LayoutDashboard, // " + MARK, "TAB_ICONS");
afterLine(
  admin,
  "const quotaLevel = worstLevel(computeQuotaAlerts(quota));",
  "  // " + MARK + " : compteurs de l'Accueil et du menu (relus à chaque changement d'onglet)\n" +
    "  const counters = useAdminCounters(isAdmin === true, nav.sub);\n" +
    "  // Le badge RGPD du menu est chargé dès l'ouverture (avant, il restait à 0 tant que l'onglet RGPD n'avait pas été ouvert)\n" +
    "  useEffect(() => {\n" +
    "    if (counters.loaded) setRgpdPendingCount(counters.rgpd.count);\n" +
    "  }, [counters.loaded, counters.rgpd.count]);",
  "Variable quotaLevel"
);
beforeLine(
  admin,
  '{!sidebarCollapsed && (activeGroup ? <ChevronDown size={14} className="shrink-0" /> : <ChevronRight size={14} className="shrink-0" />)}',
  "                    {/* " + MARK + " : ce qui attend l'administratrice (groupes Accueil et CRM) */}\n" +
    '                    {!sidebarCollapsed && (g.id === "accueil" || g.id === "crm") && counters.todoTotal > 0 && (\n' +
    "                      <span\n" +
    '                        data-testid={"group-count-" + g.id}\n' +
    '                        className={"min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-medium flex items-center justify-center shrink-0 " + (activeGroup ? "bg-white text-[#8f6075]" : counters.urgent ? "bg-red-600 text-white" : "bg-[#8f6075] text-white")}\n' +
    '                        aria-label={counters.todoTotal + " élément(s) à traiter"}\n' +
    "                      >\n" +
    "                        {counters.todoTotal}\n" +
    "                      </span>\n" +
    "                    )}",
  "Chevron du groupe"
);
beforeLine(
  admin,
  '{t.id === "quotas" && quotaLevel !== "ok" && (',
  "                            {/* " + MARK + " : compteurs des onglets Commandes, Avis et Comptes */}\n" +
    '                            {t.id === "commandes" && counters.orders.menu > 0 && (\n' +
    "                              <span\n" +
    '                                data-testid="orders-menu-badge"\n' +
    '                                className={"min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10px] font-medium flex items-center justify-center shrink-0 " + (counters.orders.alert > 0 ? "bg-red-600" : "bg-[#8f6075]")}\n' +
    '                                aria-label={counters.orders.menu + " commande(s) à traiter"}\n' +
    "                              >\n" +
    "                                {counters.orders.menu}\n" +
    "                              </span>\n" +
    "                            )}\n" +
    '                            {t.id === "avis" && counters.reviews.pending > 0 && (\n' +
    "                              <span\n" +
    '                                data-testid="reviews-menu-badge"\n' +
    '                                className={"min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10px] font-medium flex items-center justify-center shrink-0 " + (counters.reviews.late > 0 ? "bg-red-600" : "bg-[#8f6075]")}\n' +
    '                                aria-label={counters.reviews.pending + " avis à modérer"}\n' +
    "                              >\n" +
    "                                {counters.reviews.pending}\n" +
    "                              </span>\n" +
    "                            )}\n" +
    '                            {t.id === "comptes" && counters.flagged.count > 0 && (\n' +
    '                              <span data-testid="flagged-menu-dot" className="h-2 w-2 rounded-full shrink-0 bg-red-500" aria-label="Compte à surveiller" />\n' +
    "                            )}",
  "Pastille de l'onglet Quotas"
);
beforeLine(
  admin,
  '{tab === "connexions" && <AdminConnections />}',
  '        {tab === "tableau" && <AdminHome counters={counters} onGo={goTo} />} {/* ' + MARK + " */}",
  "Rendu de l'onglet Connexions"
);

// ------------------------------------------------------------------
// components/AdminCrm.js (AdminOrders s'ouvre avec le filtre choisi depuis l'Accueil)
// ------------------------------------------------------------------
afterLine(
  crm,
  'import FlaggedBadge from "@/components/FlaggedBadge";',
  "// " + MARK + " : l'Accueil ouvre cet écran avec un filtre déjà choisi\n" +
    'import { peekOrdersHandoff, clearOrdersHandoff } from "@/lib/adminCounters";',
  "Import FlaggedBadge (lot 5e requis)"
);
replaceOnce(
  crm,
  'const [statusFilter, setStatusFilter] = useState("all");',
  "useEffect(() => {\n    clearOrdersHandoff(); // " + MARK + " : le filtre venu de l'Accueil n'est utilisé qu'à l'ouverture\n  }, []);\n" +
    "  const [statusFilter, setStatusFilter] = useState(() => {\n    const h = peekOrdersHandoff();\n    return h && h.filter ? h.filter : \"all\";\n  });",
  "Etat statusFilter (AdminOrders)"
);
replaceOnce(
  crm,
  "const [includeTestData, setIncludeTestData] = useState(false);",
  "const [includeTestData, setIncludeTestData] = useState(() => {\n    const h = peekOrdersHandoff(); // " + MARK + "\n    return Boolean(h && h.includeTest);\n  });",
  "Etat includeTestData (AdminOrders)"
);

// ------------------------------------------------------------------
// Controles finaux
// ------------------------------------------------------------------
const checks = [
  [nav, "lib/adminNav.js", 4],
  [admin, "pages/admin.js", 7],
  [crm, "components/AdminCrm.js", 3],
];
for (const [d, n, min] of checks) {
  if (occurrences(d.src, MARK) < min) fail(n + " : marqueur attendu au moins " + min + " fois, trouve " + occurrences(d.src, MARK) + ".");
}
if (occurrences(admin.src, "useAdminCounters(") !== 1) fail("pages/admin.js : useAdminCounters doit etre appele une seule fois.");
if (occurrences(admin.src, "<AdminHome") !== 1) fail("pages/admin.js : AdminHome doit etre utilise une seule fois.");
if (occurrences(nav.src, 'id: "accueil"') !== 1) fail("lib/adminNav.js : groupe accueil duplique ou absent.");
if (occurrences(crm.src, "peekOrdersHandoff()") !== 2) fail("components/AdminCrm.js : peekOrdersHandoff doit etre appele 2 fois.");

const eol = admin.crlf ? "\r\n" : "\n";
const toEol = (s) => s.replace(/\n/g, eol);
console.log("");
console.log("  1. lib/adminCounters.js (nouveau)                        OK");
console.log("  2. components/AdminHome.js (nouveau)                     OK");
console.log("  3. lib/adminNav.js : groupe Accueil, page d'ouverture    OK");
console.log("  4. pages/admin.js : icones, compteurs, rendu Accueil     OK");
console.log("  5. components/AdminCrm.js : filtre venu de l'Accueil     OK");
console.log("  Lignes adminNav.js : " + before.nav + " -> " + nav.src.split("\n").length);
console.log("  Lignes admin.js : " + before.admin + " -> " + admin.src.split("\n").length);
console.log("  Lignes AdminCrm.js : " + before.crm + " -> " + crm.src.split("\n").length);

if (apply) {
  fs.writeFileSync(F_COUNTERS, toEol(COUNTERS), "utf8");
  fs.writeFileSync(F_HOME, toEol(HOME), "utf8");
  fs.writeFileSync(F_NAV, serialize(nav), "utf8");
  fs.writeFileSync(F_ADMIN, serialize(admin), "utf8");
  fs.writeFileSync(F_CRM, serialize(crm), "utf8");
  console.log("\nEcrit : lib/adminCounters.js, components/AdminHome.js, lib/adminNav.js, pages/admin.js, components/AdminCrm.js");
  console.log("Prochaine etape : npm run build");
} else {
  console.log("\nDRY-RUN termine : rien n'a ete ecrit. Relancez avec --apply.");
}
