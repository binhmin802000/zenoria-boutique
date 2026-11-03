// ZENORIA_HOME_5D_V1 : compteurs du tableau de bord (Accueil) et du menu de l'administration.
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
