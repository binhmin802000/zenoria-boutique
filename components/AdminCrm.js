import React, { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";

// ============================================================
// GROUPE « CRM » de l'administration (/admin)
//
// Deux écrans :
//  - CrmAccounts : la liste des comptes créés sur le site. C'est tout ce que la base contient pour
//    l'instant sur les clientes : une adresse e-mail et des dates. Les données viennent de la fonction
//    SQL admin_list_accounts() (voir supabase_admin_connections.sql), réservée aux administrateurs.
//  - CrmRoadmap  : ce qui viendra, avec ce dont chaque élément dépend. Rien n'y est enregistré.
// ============================================================

const TIME_ZONE = "Europe/Paris";

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: TIME_ZONE });
}

function friendlyError(err) {
  const msg = (err && err.message) || String(err || "");
  if (/could not find the function|schema cache|does not exist/i.test(msg)) {
    return "La liste des comptes n'est pas installée. Exécutez le script supabase_admin_connections.sql dans Supabase (SQL Editor).";
  }
  return "Impossible de charger les comptes : " + msg;
}

export function CrmAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [includeAdmins, setIncludeAdmins] = useState(false);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: err } = await supabase.rpc("admin_list_accounts");
    if (err) {
      setError(friendlyError(err));
      setAccounts([]);
    } else {
      setAccounts(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Les comptes d'administrateurs ne sont pas des clientes : ils sont masqués par défaut
  const customers = useMemo(() => accounts.filter((a) => !a.is_admin_account), [accounts]);

  const stats = useMemo(() => {
    const monthAgo = Date.now() - 30 * 24 * 3600 * 1000;
    return {
      total: customers.length,
      confirmed: customers.filter((a) => a.confirmed_at).length,
      recent: customers.filter((a) => a.created_at && new Date(a.created_at).getTime() >= monthAgo).length,
      never: customers.filter((a) => !a.last_sign_in_at).length,
    };
  }, [customers]);

  const q = query.trim().toLowerCase();
  const visible = (includeAdmins ? accounts : customers).filter((a) => !q || String(a.email || "").toLowerCase().includes(q));

  const cards = [
    { label: "Comptes clients", value: stats.total },
    { label: "Adresses confirmées", value: stats.confirmed },
    { label: "Inscrits ces 30 derniers jours", value: stats.recent },
    { label: "Jamais connectés", value: stats.never },
  ];

  return (
    <>
      <div className="flex justify-between items-center mb-5 gap-3">
        <div>
          <h1 className="font-serif text-2xl">Comptes clients</h1>
          <p className="text-sm text-[#8b737e]">Les personnes inscrites sur le site</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] px-4 h-10 text-sm disabled:opacity-60"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Actualiser
        </button>
      </div>

      <div data-testid="crm-notice" className="mb-5 rounded-xl bg-[#faf6f8] border border-[#eee2e5] px-4 py-3 text-[12px] leading-5 text-[#54434c]">
        Pour l&apos;instant, le CRM ne contient que les comptes créés sur le site : une adresse e-mail et des dates. Les fiches clientes, les adresses et les commandes
        viendront avec la base de données et le paiement : voir l&apos;onglet « À venir ».
      </div>

      {error && (
        <div className="mb-5 rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm" role="alert">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl bg-white border border-[#eee2e5] px-4 py-4">
            <div className="font-serif text-3xl text-[#8f6075]" data-testid="crm-stat">
              {loading ? "…" : c.value}
            </div>
            <div className="text-xs text-[#756a70] mt-1">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher une adresse e-mail"
          aria-label="Rechercher une adresse e-mail"
          data-testid="crm-search"
          className="w-full sm:w-72 rounded-full border border-[#eadfe4] bg-white px-4 h-10 text-sm outline-none focus:border-[#8f6075]"
        />
        <label className="flex items-center gap-2 text-sm text-[#54434c]">
          <input type="checkbox" checked={includeAdmins} onChange={(e) => setIncludeAdmins(e.target.checked)} data-testid="crm-include-admins" className="h-4 w-4" />
          Afficher aussi les comptes administrateurs
        </label>
      </div>

      <div className="bg-white rounded-2xl border border-[#eee2e5] overflow-x-auto mb-4">
        <table className="w-full min-w-[560px] text-sm" data-testid="crm-table">
          <thead>
            <tr className="bg-[#f5edf1] text-left text-[#8b737e]">
              <th className="px-4 py-3 font-medium">E-mail</th>
              <th className="px-4 py-3 font-medium">Inscrit(e) le</th>
              <th className="px-4 py-3 font-medium">Adresse</th>
              <th className="px-4 py-3 font-medium">Dernière connexion</th>
            </tr>
          </thead>
          <tbody>
            {!loading && !error && visible.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-[#8b737e]">
                  {q ? "Aucun compte ne correspond à cette recherche." : "Aucun compte client pour le moment."}
                </td>
              </tr>
            )}
            {visible.map((a) => (
              <tr key={a.account_id} className="border-t border-[#eee2e5]" data-testid="crm-row">
                <td className="px-4 py-3">
                  <span className="font-medium whitespace-nowrap">{a.email || "—"}</span>
                  {a.is_admin_account && <span className="ml-2 rounded-full bg-[#f5edf1] text-[#8f6075] px-2 py-0.5 text-[11px]">Admin</span>}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-[#54434c]">{formatDateTime(a.created_at)}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-3 py-1 text-xs whitespace-nowrap ${a.confirmed_at ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                    {a.confirmed_at ? "Confirmée" : "Non confirmée"}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-[#54434c]">{a.last_sign_in_at ? formatDateTime(a.last_sign_in_at) : "Jamais"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] leading-4 text-[#8b737e]">
        Les adresses e-mail sont des données personnelles : cet écran est réservé à l&apos;administration. En attendant un outil d&apos;export et d&apos;effacement, une demande
        d&apos;effacement se traite à la main dans Supabase (Authentication, Users). L&apos;historique des connexions et les adresses IP restent dans Technique, onglet Connexions.
      </p>
    </>
  );
}

// Ce qui viendra, avec ce dont chaque élément dépend. Aucune date : elles dépendent de la base de données et du paiement.
const ROADMAP = [
  {
    title: "Fiches clientes",
    text: "Nom, téléphone facultatif, préférences, historique des échanges.",
    needs: "Base de données, phase 1 (tables de clientes).",
  },
  {
    title: "Adresses de livraison et de facturation",
    text: "Une ou plusieurs adresses par cliente, reprises à la commande.",
    needs: "Paiement en ligne et tables de commandes.",
  },
  {
    title: "Commandes et historique d'achat",
    text: "Les commandes d'une cliente, leur statut, le montant dépensé, la date du dernier achat.",
    needs: "Paiement en ligne et tables de commandes.",
  },
  {
    title: "Newsletter et consentements",
    text: "Aujourd'hui, le champ « Je m'inscris » du site n'enregistre aucune adresse. Il faudra un consentement explicite, daté, avec possibilité de se désinscrire.",
    needs: "Base de données, phase 1 ; domaine vérifié dans Resend pour les envois.",
  },
  {
    title: "Export et anonymisation à la demande (RGPD)",
    text: "Fournir ou effacer toutes les données d'une cliente en un clic, avec une trace de la demande. À concevoir en même temps que les tables clientes.",
    needs: "Base de données, phase 1.",
  },
  {
    title: "Favoris et avis",
    text: "Les bagues mises en favori (aujourd'hui, uniquement dans le navigateur) et les avis des clientes.",
    needs: "Commandes enregistrées (pour n'accepter que des avis d'acheteuses).",
  },
];

export function CrmRoadmap() {
  return (
    <>
      <div className="mb-5">
        <h1 className="font-serif text-2xl">À venir dans le CRM</h1>
        <p className="text-sm text-[#8b737e]">Ce qui sera ajouté, et ce dont chaque élément dépend</p>
      </div>
      <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[12px] leading-5 px-4 py-3 mb-5" data-testid="roadmap-notice">
        Rien de cette liste n&apos;existe encore : aucune donnée n&apos;est enregistrée à ce sujet. Chaque élément dépend de la base de données (phase 1) ou du paiement en
        ligne, qui ne sont pas encore en place.
      </div>
      <ul className="grid md:grid-cols-2 gap-3" data-testid="roadmap-list">
        {ROADMAP.map((r) => (
          <li key={r.title} className="rounded-2xl bg-white border border-[#eee2e5] px-5 py-4" data-testid="roadmap-item">
            <div className="font-serif text-lg text-[#412f3b]">{r.title}</div>
            <p className="text-[13px] leading-5 text-[#54434c] mt-1.5">{r.text}</p>
            <p className="text-[11px] leading-4 text-[#8b737e] mt-2.5">
              <strong>Dépend de :</strong> {r.needs}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}
