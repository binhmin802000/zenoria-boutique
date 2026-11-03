// ZENORIA_HOME_5D_V1 : Accueil de l'administration (tableau de bord).
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
