import React, { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";

// ============================================================
// ONGLET « CONNEXIONS » de l'administration (/admin)
//
// Affiche, pour les administrateurs uniquement :
//  - la liste des comptes avec leur dernière connexion
//  - l'historique des derniers événements de connexion
//
// Les données viennent de deux fonctions SQL réservées aux
// administrateurs (voir supabase_admin_connections.sql). Pour toute
// autre personne, ces fonctions renvoient un résultat vide.
// ============================================================

const TIME_ZONE = "Europe/Paris";

// Libellé français et couleur de chaque type d'événement
const EVENT_LABELS = {
  login: { label: "Connexion", style: "bg-emerald-50 text-emerald-700" },
  logout: { label: "Déconnexion", style: "bg-[#f0e6ea] text-[#8b737e]" },
  user_signedup: { label: "Inscription", style: "bg-violet-50 text-violet-700" },
  user_confirmation_requested: { label: "Confirmation e-mail demandée", style: "bg-amber-50 text-amber-700" },
  user_recovery_requested: { label: "Mot de passe oublié", style: "bg-amber-50 text-amber-700" },
  user_updated_password: { label: "Mot de passe modifié", style: "bg-sky-50 text-sky-700" },
  user_repeated_signup: { label: "Inscription en double", style: "bg-rose-50 text-rose-700" },
};

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: TIME_ZONE,
  });
}

// « il y a 3 h », « il y a 2 j »... (ou « jamais » si aucune connexion)
function timeAgo(value) {
  if (!value) return "Jamais connecté(e)";
  const diffSec = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (diffSec < 60) return "à l'instant";
  const min = Math.round(diffSec / 60);
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  if (d < 60) return `il y a ${d} j`;
  const mo = Math.round(d / 30);
  return `il y a ${mo} mois`;
}

function friendlyError(err) {
  const msg = (err && err.message) || "";
  if (/could not find the function|schema cache|does not exist/i.test(msg)) {
    return "Les fonctions de lecture des connexions ne sont pas encore installées. Exécutez le script supabase_admin_connections.sql dans Supabase (SQL Editor).";
  }
  return "Impossible de charger les données : " + msg;
}

export default function AdminConnections() {
  const [accounts, setAccounts] = useState([]);
  const [history, setHistory] = useState([]);
  const [maxRows, setMaxRows] = useState(50);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [acc, hist] = await Promise.all([
      supabase.rpc("admin_list_accounts"),
      supabase.rpc("admin_login_history", { max_rows: maxRows }),
    ]);
    if (acc.error) {
      setError(friendlyError(acc.error));
    } else if (hist.error) {
      setError(friendlyError(hist.error));
    }
    setAccounts(acc.data || []);
    setHistory(hist.data || []);
    setLoading(false);
  }, [maxRows]);

  useEffect(() => {
    load();
  }, [load]);

  // Chiffres de synthèse
  const stats = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
    return {
      total: accounts.length,
      confirmed: accounts.filter((a) => a.confirmed_at).length,
      active7d: accounts.filter((a) => a.last_sign_in_at && new Date(a.last_sign_in_at).getTime() >= weekAgo).length,
      sessions: accounts.reduce((s, a) => s + Number(a.active_sessions || 0), 0),
    };
  }, [accounts]);

  const cards = [
    { label: "Comptes", value: stats.total },
    { label: "Comptes confirmés", value: stats.confirmed },
    { label: "Connectés ces 7 derniers jours", value: stats.active7d },
    { label: "Sessions ouvertes", value: stats.sessions },
  ];

  return (
    <>
      <div className="flex justify-between items-center mb-5 gap-3">
        <div>
          <h1 className="font-serif text-2xl">Connexions</h1>
          <p className="text-sm text-[#8b737e]">Comptes clients et administrateurs, et derniers événements</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] px-4 h-10 text-sm disabled:opacity-60"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Actualiser
        </button>
      </div>

      {error && <div className="mb-5 rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm">{error}</div>}

      {/* Chiffres de synthèse */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl bg-white border border-[#eee2e5] px-4 py-4">
            <div className="font-serif text-3xl text-[#8f6075]">{loading ? "…" : c.value}</div>
            <div className="text-xs text-[#756a70] mt-1">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Comptes */}
      <h2 className="font-serif text-xl mb-3">Comptes</h2>
      <div className="bg-white rounded-2xl border border-[#eee2e5] overflow-x-auto mb-10">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="bg-[#f5edf1] text-left text-[#8b737e]">
              <th className="px-4 py-3 font-medium">E-mail</th>
              <th className="px-4 py-3 font-medium">Dernière connexion</th>
              <th className="px-4 py-3 font-medium hidden md:table-cell">Inscrit(e) le</th>
              <th className="px-4 py-3 font-medium">Sessions</th>
              <th className="px-4 py-3 font-medium">Statut</th>
            </tr>
          </thead>
          <tbody>
            {!loading && accounts.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-[#8b737e]">
                  Aucun compte à afficher.
                </td>
              </tr>
            )}
            {accounts.map((a) => (
              <tr key={a.account_id} className="border-t border-[#eee2e5]">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium whitespace-nowrap">{a.email || "—"}</span>
                    {a.is_admin_account && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#f5edf1] text-[#8f6075] px-2 py-0.5 text-[11px] shrink-0">
                        <ShieldCheck size={12} /> Admin
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3" title={formatDateTime(a.last_sign_in_at)}>
                  <div>{timeAgo(a.last_sign_in_at)}</div>
                  {a.last_sign_in_at && <div className="text-xs text-[#8b737e]">{formatDateTime(a.last_sign_in_at)}</div>}
                </td>
                <td className="px-4 py-3 hidden md:table-cell text-[#54434c]">{formatDateTime(a.created_at)}</td>
                <td className="px-4 py-3">{Number(a.active_sessions || 0)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-3 py-1 text-xs whitespace-nowrap ${
                      a.confirmed_at ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {a.confirmed_at ? "Confirmé" : "Non confirmé"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Historique */}
      <div className="flex justify-between items-end mb-3 gap-3">
        <h2 className="font-serif text-xl">Historique des événements</h2>
        <label className="text-xs text-[#8b737e] flex items-center gap-2">
          Afficher
          <select
            value={maxRows}
            onChange={(e) => setMaxRows(Number(e.target.value))}
            className="rounded-lg border border-[#eadfe4] bg-white px-2 h-8 text-sm text-[#342b32] outline-none focus:border-[#8f6075]"
          >
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>
          derniers
        </label>
      </div>
      <div className="bg-white rounded-2xl border border-[#eee2e5] overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="bg-[#f5edf1] text-left text-[#8b737e]">
              <th className="px-4 py-3 font-medium">Date et heure</th>
              <th className="px-4 py-3 font-medium">E-mail</th>
              <th className="px-4 py-3 font-medium">Événement</th>
              <th className="px-4 py-3 font-medium hidden md:table-cell">Adresse IP</th>
            </tr>
          </thead>
          <tbody>
            {!loading && history.length === 0 && !error && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-[#8b737e] leading-6">
                  Aucun événement enregistré pour le moment.
                  <br />
                  Si des personnes se sont déjà connectées, vérifiez dans Supabase, Authentication, Audit Logs, que
                  l&apos;option « Write audit logs to the database » est activée.
                </td>
              </tr>
            )}
            {history.map((h, i) => {
              const ev = EVENT_LABELS[h.action] || { label: h.action || "—", style: "bg-[#f0e6ea] text-[#8b737e]" };
              return (
                <tr key={`${h.event_at}-${i}`} className="border-t border-[#eee2e5]">
                  <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(h.event_at)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{h.email || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-3 py-1 text-xs whitespace-nowrap ${ev.style}`}>{ev.label}</span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-[#54434c]">{h.ip_address || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] leading-4 text-[#8b737e] mt-4">
        Les adresses e-mail et IP sont des données personnelles : réservez cet écran à l&apos;administration et
        mentionnez la journalisation des connexions dans votre politique de confidentialité. Les renouvellements
        automatiques de session ne sont pas affichés.
      </p>
    </>
  );
}
