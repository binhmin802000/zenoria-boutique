import React, { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  WARN_PERCENT,
  CRITICAL_PERCENT,
  STALE_DAYS,
  SUPABASE_PLANS,
  VERCEL_PLANS,
  DEFAULT_SUPABASE_PLAN,
  DEFAULT_VERCEL_PLAN,
  MANUAL_METRICS,
  LEVEL_STYLE,
  buildGauges,
  buildAlerts,
  worstLevel,
  parseManual,
  formatBytes,
  formatCount,
} from "@/lib/quota";

// ============================================================
// ONGLET « QUOTAS » de l'administration (/admin)
//
// Surveille la consommation de Supabase et de Vercel pour rester dans le forfait choisi.
//  - MESURÉ AUTOMATIQUEMENT (Supabase) : taille de la base, taille des fichiers, comptes actifs.
//    Lu par des fonctions SQL réservées aux administrateurs (voir supabase_admin_quotas.sql).
//  - RELEVÉ À LA MAIN : le transfert sortant de Supabase et les compteurs de Vercel, que le site ne peut pas
//    lire de façon fiable. On les recopie depuis les pages « Usage » (une fois par semaine suffit).
//  - ALERTES : bandeau en haut de /admin dès 70 % (orange) et 90 % (rouge).
// Aucune clé secrète n'est stockée ici.
// ============================================================

const TIME_ZONE = "Europe/Paris";
const SETTINGS_TABLE = "quota_settings";
const KEY_SUPABASE_PLAN = "supabase_plan";
const KEY_VERCEL_PLAN = "vercel_plan";
const KEY_MANUAL = "manual_readings";

function formatDateTime(value) {
  if (!value) return null;
  return new Date(value).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: TIME_ZONE });
}

function friendlyError(err) {
  const msg = (err && err.message) || String(err || "");
  if (/could not find the function|schema cache|does not exist|relation/i.test(msg)) {
    return "Les fonctions de lecture des quotas ne sont pas encore installées. Exécutez le script supabase_admin_quotas.sql dans Supabase (SQL Editor).";
  }
  return "Impossible de charger les données : " + msg;
}

// ------------------------------------------------------------
// Chargement des données (utilisé par le bandeau d'alerte ET par l'onglet)
// ------------------------------------------------------------
export function useQuotaStatus(enabled) {
  const [state, setState] = useState({
    loading: true,
    error: "",
    summary: null,
    supabasePlan: DEFAULT_SUPABASE_PLAN,
    vercelPlan: DEFAULT_VERCEL_PLAN,
    manual: null,
  });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: "" }));
    const [sum, set] = await Promise.all([supabase.rpc("admin_usage_summary"), supabase.from(SETTINGS_TABLE).select("*")]);

    let error = "";
    if (sum.error) error = friendlyError(sum.error);
    else if (set.error) error = friendlyError(set.error);

    const row = Array.isArray(sum.data) ? sum.data[0] : sum.data;
    const settings = {};
    (set.data || []).forEach((r) => {
      settings[r.key] = r;
    });

    const plan = (map, key, fallback) => {
      const v = settings[key] && settings[key].value;
      return v && map[v] ? v : fallback;
    };
    const manualRow = settings[KEY_MANUAL];
    const parsed = manualRow ? parseManual(manualRow.value) : null;

    setState({
      loading: false,
      error,
      summary: row || null,
      supabasePlan: plan(SUPABASE_PLANS, KEY_SUPABASE_PLAN, DEFAULT_SUPABASE_PLAN),
      vercelPlan: plan(VERCEL_PLANS, KEY_VERCEL_PLAN, DEFAULT_VERCEL_PLAN),
      // la date et l'auteur du relevé viennent de la base (heure du serveur), pas du navigateur
      manual: parsed ? { values: parsed.values, read_at: manualRow.updated_at || null, by: manualRow.updated_by_email || null } : null,
    });
  }, []);

  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);

  const save = useCallback(
    async (key, value) => {
      const { error } = await supabase.from(SETTINGS_TABLE).upsert({ key, value }, { onConflict: "key" });
      if (!error) await load();
      return { error };
    },
    [load]
  );

  const savePlan = useCallback((kind, value) => save(kind === "supabase" ? KEY_SUPABASE_PLAN : KEY_VERCEL_PLAN, value), [save]);
  const saveManual = useCallback((values) => save(KEY_MANUAL, JSON.stringify({ values })), [save]);

  return { ...state, reload: load, savePlan, saveManual };
}

// Alertes calculées à partir de l'état chargé
export function computeQuotaAlerts(status) {
  if (!status || status.loading || (status.error && !status.summary)) return [];
  const gauges = buildGauges({
    summary: status.summary,
    supabasePlan: status.supabasePlan,
    vercelPlan: status.vercelPlan,
    manual: status.manual,
  });
  return buildAlerts(gauges, status.manual);
}

// ------------------------------------------------------------
// Bandeau d'alerte (affiché en haut de /admin)
// ------------------------------------------------------------
export function QuotaBanner({ status, onOpen }) {
  const [dismissed, setDismissed] = useState(false);
  const alerts = useMemo(() => computeQuotaAlerts(status), [status]);
  if (dismissed || alerts.length === 0) return null;
  const level = worstLevel(alerts);
  const critical = level === "critical";
  const shown = alerts.slice(0, 3);
  const dbCritical = alerts.some((a) => a.key === "db" && a.level === "critical");
  return (
    <div
      role="alert"
      data-testid="quota-banner"
      data-level={level}
      className={`mb-5 rounded-xl px-4 py-3 text-sm flex flex-wrap items-start gap-x-4 gap-y-2 ${
        critical ? "bg-red-50 text-red-700 border border-red-200" : "bg-amber-50 text-amber-800 border border-amber-200"
      }`}
    >
      <div className="flex-1 min-w-[240px]">
        <strong>{critical ? "Quota critique" : "Quota à surveiller"}</strong>
        <ul className="mt-1 space-y-0.5 text-[13px] leading-5">
          {shown.map((a) => (
            <li key={a.key}>{a.text}</li>
          ))}
          {alerts.length > shown.length && <li>… et {alerts.length - shown.length} autre(s) indicateur(s).</li>}
        </ul>
        {dbCritical && (
          <p className="mt-1.5 text-[12px] leading-4">
            Au-delà de la limite, la base passe en lecture seule : le catalogue reste visible, mais aucune commande ni inscription ne s&apos;enregistre.
          </p>
        )}
      </div>
      <div className="flex gap-3 items-center shrink-0">
        <button type="button" onClick={onOpen} className="underline font-medium">
          Voir le détail
        </button>
        <button type="button" onClick={() => setDismissed(true)} className="text-xs underline opacity-80" aria-label="Masquer l'alerte jusqu'au prochain chargement">
          Masquer
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Une jauge
// ------------------------------------------------------------
function Gauge({ g }) {
  const st = LEVEL_STYLE[g.level];
  const width = g.percent === null ? 0 : Math.min(100, g.percent);
  return (
    <div data-testid={`gauge-${g.key}`} data-level={g.level} className="rounded-2xl bg-white border border-[#eee2e5] p-4">
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-[#9a7384]">{g.service}</div>
          <div className="text-sm font-medium leading-5">{g.label}</div>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] whitespace-nowrap ${st.chip}`}>
          {g.percent !== null ? `${String(g.percent).replace(".", ",")} %` : st.label}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(width)}
        aria-label={g.label}
        className="relative h-2.5 rounded-full bg-[#f0e6ea] overflow-hidden mt-3"
      >
        <div className={`h-full rounded-full ${st.bar}`} style={{ width: `${width}%` }} />
        <span className="absolute top-0 bottom-0 w-px bg-white/90" style={{ left: `${WARN_PERCENT}%` }} />
        <span className="absolute top-0 bottom-0 w-px bg-white/90" style={{ left: `${CRITICAL_PERCENT}%` }} />
      </div>
      <div className="text-xs text-[#756a70] mt-2 tabular-nums" data-testid={`gauge-${g.key}-text`}>
        {g.usedText} sur {g.limitText}
      </div>
      {g.note && <p className="text-[11px] text-[#8b737e] mt-1.5 leading-4">{g.note}</p>}
      {g.stale && <p className="text-[11px] text-amber-700 mt-1.5 leading-4">Relevé ancien : refaites-le.</p>}
    </div>
  );
}

// ------------------------------------------------------------
// L'onglet
// ------------------------------------------------------------
export default function AdminQuotas({ status }) {
  const { loading, error, summary, supabasePlan, vercelPlan, manual, reload, savePlan, saveManual } = status;
  const [toast, setToast] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});
  const [details, setDetails] = useState({ files: [], folders: [], tables: [], error: "" });
  const [detailsLoading, setDetailsLoading] = useState(false);

  const gauges = useMemo(
    () => buildGauges({ summary, supabasePlan, vercelPlan, manual }),
    [summary, supabasePlan, vercelPlan, manual]
  );
  const alerts = useMemo(() => buildAlerts(gauges, manual), [gauges, manual]);
  const autoGauges = gauges.filter((g) => g.source === "auto");
  const manualGauges = gauges.filter((g) => g.source === "manual");

  // Les champs du formulaire reprennent le dernier relevé enregistré
  useEffect(() => {
    const values = (manual && manual.values) || {};
    const next = {};
    MANUAL_METRICS.forEach((m) => {
      next[m.key] = values[m.key] === undefined || values[m.key] === null ? "" : String(values[m.key]);
    });
    setForm(next);
  }, [manual]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const loadDetails = useCallback(async () => {
    setDetailsLoading(true);
    const [f, fo, t] = await Promise.all([
      supabase.rpc("admin_usage_top_files", { max_rows: 10 }),
      supabase.rpc("admin_usage_by_folder"),
      supabase.rpc("admin_usage_tables"),
    ]);
    setDetails({
      files: f.data || [],
      folders: fo.data || [],
      tables: t.data || [],
      error: f.error || fo.error || t.error ? friendlyError(f.error || fo.error || t.error) : "",
    });
    setDetailsLoading(false);
  }, []);

  useEffect(() => {
    loadDetails();
  }, [loadDetails]);

  const refreshAll = () => {
    reload();
    loadDetails();
  };

  const onPlan = (kind) => async (e) => {
    const { error: err } = await savePlan(kind, e.target.value);
    setToast(err ? "" : "Forfait enregistré : les limites des jauges sont mises à jour.");
    if (err) setFormError("Échec de l'enregistrement du forfait : " + (err.message || err));
  };

  const onSaveManual = async (e) => {
    e.preventDefault();
    setFormError("");
    const values = {};
    for (const m of MANUAL_METRICS) {
      const raw = String(form[m.key] ?? "").trim();
      if (raw === "") continue;
      const n = Number(raw.replace(",", "."));
      if (!Number.isFinite(n) || n < 0) {
        setFormError(`« ${m.label} » : saisissez un nombre positif (ex. 12,5).`);
        return;
      }
      values[m.key] = raw;
    }
    setSaving(true);
    const { error: err } = await saveManual(values);
    setSaving(false);
    if (err) setFormError("Échec de l'enregistrement du relevé : " + (err.message || err));
    else setToast("Relevé enregistré.");
  };

  const vercelPlanInfo = VERCEL_PLANS[vercelPlan] || VERCEL_PLANS[DEFAULT_VERCEL_PLAN];
  const maxFolder = Math.max(1, ...details.folders.map((f) => Number(f.bytes) || 0));

  return (
    <>
      <div className="flex justify-between items-center mb-5 gap-3">
        <div>
          <h1 className="font-serif text-2xl">Quotas et alertes</h1>
          <p className="text-sm text-[#8b737e]">
            Surveillez Supabase et Vercel pour rester dans votre forfait. Alertes à {WARN_PERCENT} % (orange) et {CRITICAL_PERCENT} % (rouge).
          </p>
        </div>
        <button
          onClick={refreshAll}
          disabled={loading || detailsLoading}
          className="flex items-center gap-1.5 rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] px-4 h-10 text-sm disabled:opacity-60"
        >
          <RefreshCw size={15} className={loading || detailsLoading ? "animate-spin" : ""} /> Actualiser
        </button>
      </div>

      {toast && <div className="mb-5 rounded-xl bg-emerald-50 text-emerald-700 px-4 py-3 text-sm">{toast}</div>}
      {error && <div className="mb-5 rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm" role="alert">{error}</div>}

      {/* Alertes en cours */}
      {!loading && (
        <div
          data-testid="alert-summary"
          data-level={worstLevel(alerts)}
          className={`mb-6 rounded-2xl border px-4 py-3 text-sm ${
            alerts.length === 0
              ? "bg-emerald-50 border-emerald-100 text-emerald-700"
              : worstLevel(alerts) === "critical"
              ? "bg-red-50 border-red-200 text-red-700"
              : "bg-amber-50 border-amber-200 text-amber-800"
          }`}
        >
          {alerts.length === 0 ? (
            "Aucune alerte : tous les indicateurs relevés sont sous 70 % de leur limite."
          ) : (
            <ul className="space-y-0.5">
              {alerts.map((a) => (
                <li key={a.key}>{a.text}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Forfaits choisis */}
      <section className="mb-8">
        <h2 className="font-serif text-xl mb-3">Forfaits choisis</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="text-sm rounded-2xl bg-white border border-[#eee2e5] p-4 block">
            <span className="text-xs text-[#8b737e]">Forfait Supabase</span>
            <select
              aria-label="Forfait Supabase"
              value={supabasePlan}
              onChange={onPlan("supabase")}
              className="mt-1 w-full rounded-xl border border-[#eadfe4] px-3 h-10 outline-none focus:border-[#8f6075] bg-white"
            >
              {Object.entries(SUPABASE_PLANS).map(([k, p]) => (
                <option key={k} value={k}>{p.label}</option>
              ))}
            </select>
          </label>
          <label className="text-sm rounded-2xl bg-white border border-[#eee2e5] p-4 block">
            <span className="text-xs text-[#8b737e]">Forfait Vercel</span>
            <select
              aria-label="Forfait Vercel"
              value={vercelPlan}
              onChange={onPlan("vercel")}
              className="mt-1 w-full rounded-xl border border-[#eadfe4] px-3 h-10 outline-none focus:border-[#8f6075] bg-white"
            >
              {Object.entries(VERCEL_PLANS).map(([k, p]) => (
                <option key={k} value={k}>{p.label}</option>
              ))}
            </select>
          </label>
        </div>
        {!vercelPlanInfo.commercialOk && (
          <p data-testid="hobby-warning" className="mt-3 rounded-xl bg-amber-50 text-amber-800 px-4 py-3 text-[13px] leading-5">
            Le forfait Vercel Hobby est réservé aux projets personnels et non commerciaux. Avant de vendre des bagues, passez à un forfait
            qui autorise l&apos;usage commercial et faites vérifier les conditions de Vercel.
          </p>
        )}
        <p className="text-[11px] text-[#8b737e] mt-2 leading-4">
          Les limites des jauges dépendent du forfait choisi ci-dessus. Elles ont été relevées sur les pages officielles des forfaits en octobre 2026 :
          vérifiez-les de temps en temps, elles peuvent changer.
        </p>
      </section>

      {/* Mesure automatique */}
      <section className="mb-8">
        <h2 className="font-serif text-xl mb-1">Supabase — mesuré automatiquement</h2>
        <p className="text-xs text-[#8b737e] mb-3">
          {loading ? "Chargement…" : summary ? `${formatCount(summary.storage_objects)} fichier(s) stocké(s) · ${formatCount(summary.users_total)} compte(s) au total.` : "Aucune mesure disponible."}
        </p>
        <div className="grid md:grid-cols-3 gap-4">
          {autoGauges.map((g) => <Gauge key={g.key} g={g} />)}
        </div>
      </section>

      {/* Relevé manuel */}
      <section className="mb-8">
        <h2 className="font-serif text-xl mb-1">Relevé manuel — transfert Supabase et Vercel</h2>
        <p className="text-xs text-[#8b737e] mb-3 leading-4">
          Le site ne peut pas lire ces compteurs de façon fiable : recopiez-les depuis les pages « Usage » de Supabase et de Vercel, une fois par
          semaine. Un relevé de plus de {STALE_DAYS} jours est signalé.
        </p>
        <div className="grid md:grid-cols-3 gap-4 mb-5">
          {manualGauges.map((g) => <Gauge key={g.key} g={g} />)}
        </div>

        <form onSubmit={onSaveManual} data-testid="manual-form" className="rounded-2xl bg-white border border-[#eee2e5] p-5">
          <div className="grid sm:grid-cols-2 gap-4">
            {MANUAL_METRICS.map((m) => (
              <label key={m.key} className="text-sm">
                <span className="text-xs text-[#8b737e]">
                  {m.service} · {m.label} ({m.unit === "go" ? "en Go" : m.unit === "minutes" ? "en minutes" : "nombre"})
                </span>
                <input
                  inputMode="decimal"
                  value={form[m.key] ?? ""}
                  onChange={(e) => setForm({ ...form, [m.key]: e.target.value })}
                  data-testid={`input-${m.key}`}
                  placeholder="laisser vide si non relevé"
                  className="mt-1 w-full rounded-xl border border-[#eadfe4] px-3 h-10 outline-none focus:border-[#8f6075]"
                />
                <span className="text-[11px] text-[#8b737e]">{m.hint}</span>
              </label>
            ))}
          </div>
          {formError && <div className="mt-4 text-sm rounded-xl bg-red-50 text-red-600 px-4 py-3" role="alert">{formError}</div>}
          <div className="flex flex-wrap items-center gap-4 mt-5">
            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-6 h-11 text-sm font-medium disabled:opacity-60"
            >
              {saving ? "Enregistrement..." : "Enregistrer le relevé"}
            </button>
            <span className="text-xs text-[#8b737e]" data-testid="manual-meta">
              {manual && manual.read_at
                ? `Dernier relevé : ${formatDateTime(manual.read_at)}${manual.by ? " · " + manual.by : ""}`
                : "Aucun relevé enregistré pour le moment."}
            </span>
          </div>
        </form>
      </section>

      {/* Où va l'espace */}
      <section className="mb-8">
        <h2 className="font-serif text-xl mb-3">Où va l&apos;espace ?</h2>
        {details.error && <div className="mb-4 rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm" role="alert">{details.error}</div>}
        <div className="grid lg:grid-cols-2 gap-5">
          <div className="rounded-2xl bg-white border border-[#eee2e5] p-4 overflow-x-auto">
            <h3 className="text-sm font-medium mb-2">Les 10 fichiers les plus lourds</h3>
            <table className="w-full text-xs min-w-[300px]" data-testid="top-files">
              <thead>
                <tr className="text-left text-[#8b737e]">
                  <th className="py-1.5 font-medium">Fichier</th>
                  <th className="py-1.5 font-medium text-right">Taille</th>
                </tr>
              </thead>
              <tbody>
                {!detailsLoading && details.files.length === 0 && (
                  <tr><td colSpan={2} className="py-3 text-[#8b737e]">Aucun fichier.</td></tr>
                )}
                {details.files.map((f) => (
                  <tr key={f.bucket_id + "/" + f.name} className="border-t border-[#f0e6ea]">
                    <td className="py-1.5 pr-3 break-all">{f.name}</td>
                    <td className="py-1.5 text-right whitespace-nowrap tabular-nums">{formatBytes(f.size_bytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-2xl bg-white border border-[#eee2e5] p-4">
            <h3 className="text-sm font-medium mb-2">Fichiers par dossier</h3>
            <ul className="space-y-2" data-testid="folders">
              {!detailsLoading && details.folders.length === 0 && <li className="text-xs text-[#8b737e]">Aucun dossier.</li>}
              {details.folders.map((f) => (
                <li key={f.folder} className="text-xs">
                  <div className="flex justify-between gap-3">
                    <span className="break-all">{f.folder}</span>
                    <span className="whitespace-nowrap text-[#756a70] tabular-nums">{formatBytes(f.bytes)} · {formatCount(f.files)} fichier(s)</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[#f0e6ea] mt-1 overflow-hidden">
                    <div className="h-full rounded-full bg-[#b88d9f]" style={{ width: `${Math.max(2, ((Number(f.bytes) || 0) / maxFolder) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-[#eee2e5] p-4 mt-5 overflow-x-auto">
          <h3 className="text-sm font-medium mb-2">Tables de la base de données</h3>
          <table className="w-full text-xs min-w-[300px]" data-testid="db-tables">
            <thead>
              <tr className="text-left text-[#8b737e]">
                <th className="py-1.5 font-medium">Table</th>
                <th className="py-1.5 font-medium text-right">Taille</th>
                <th className="py-1.5 font-medium text-right">Lignes (estimation)</th>
              </tr>
            </thead>
            <tbody>
              {details.tables.map((t) => (
                <tr key={t.table_name} className="border-t border-[#f0e6ea]">
                  <td className="py-1.5">{t.table_name}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatBytes(t.total_bytes)}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatCount(t.approx_rows)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Aide-mémoire */}
      <section className="rounded-2xl bg-[#faf6f8] border border-[#eee2e5] p-5 text-[13px] leading-5 text-[#54434c]">
        <h2 className="font-serif text-lg mb-2">Aide-mémoire hebdomadaire</h2>
        <ol className="list-decimal pl-5 space-y-1.5">
          <li>Ouvrez cet onglet : les trois jauges Supabase se mettent à jour toutes seules.</li>
          <li>Dans Supabase, ouvrez la page Usage de votre organisation et recopiez le transfert sortant (Egress). L&apos;emplacement exact peut varier selon la version de l&apos;interface.</li>
          <li>Dans Vercel, ouvrez la page Usage de votre compte ou de votre équipe et recopiez le transfert rapide, les requêtes, les appels de fonctions et les minutes de build.</li>
          <li>Enregistrez le relevé : une jauge orange ou rouge déclenche le bandeau d&apos;alerte sur toutes les pages de l&apos;administration.</li>
        </ol>
        <p className="mt-3">
          <strong>Que faire en cas d&apos;alerte ?</strong> Supprimez les fichiers inutiles (liste ci-dessus), réduisez la durée ou le poids des vidéos, ou passez au
          forfait supérieur avant d&apos;atteindre la limite.
        </p>
        <p className="mt-2 text-[12px] text-[#8b737e]">
          Les alertes par e-mail ne sont pas encore actives : elles nécessitent un domaine d&apos;envoi vérifié.
        </p>
      </section>
    </>
  );
}
