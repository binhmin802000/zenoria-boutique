import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Copy } from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import { supabase, getMediaUrl, PRODUCT_MEDIA_BUCKET } from "@/lib/supabase";
import { videoSupport } from "@/lib/prepareVideo";
import { setDiagnosticMode, uaFamily } from "@/lib/errorLogger";
import { GROUPS, STATUS, STATUS_LABEL, buildTests, runDiagnostics, summarize, synthesize, formatReport } from "@/lib/diagnostics";

// ============================================================
// ONGLET « SANTÉ » de l'administration (/admin)
//
// 1. DIAGNOSTIC : un bouton lance une série de tests simples, du plus proche au plus lointain
//    (poste, site Vercel, Supabase, droits, base, stockage, médias, maintenance, erreurs, quotas,
//    statuts des fournisseurs). Chaque problème est expliqué : cause probable et action à mener.
//    Un rapport texte est copiable pour être transmis (il ne contient aucun secret).
// 2. JOURNAL DES ERREURS : ce que les visiteurs ont rencontré (voir lib/errorLogger.js).
// 3. SURVEILLANCE EXTERNE : l'adresse à faire interroger par un service de sonde.
//
// Les tests partent de VOTRE navigateur : sur le réseau de l'entreprise, certains services peuvent
// être bloqués. Le site (Vercel) refait donc lui-même la vérification de Supabase, et les deux points
// de vue sont comparés dans la conclusion.
// ============================================================

const TIME_ZONE = "Europe/Paris";

const KIND_LABEL = {
  js_error: "Erreur JavaScript",
  unhandled_rejection: "Promesse rejetée",
  api_error: "Appel réseau",
  react_error: "Affichage",
};

const CHIP = {
  ok: "bg-emerald-50 text-emerald-700",
  warn: "bg-amber-50 text-amber-700",
  fail: "bg-red-50 text-red-700",
  skip: "bg-[#f0e6ea] text-[#8b737e]",
  pending: "bg-[#f0e6ea] text-[#8b737e]",
  running: "bg-sky-50 text-sky-700",
};

const SYMPTOMS = [
  ["Le site ne s'affiche plus", "Regardez « Le site répond (Vercel) », puis le statut de Vercel."],
  ["Le catalogue est vide ou ne charge pas", "« Supabase vu depuis ce navigateur » et « vu depuis le site » : si seul le premier échoue, le blocage est local."],
  ["Les inscriptions ou commandes échouent, mais le catalogue s'affiche", "« Base de données : écriture possible » : base en lecture seule (500 Mo)."],
  ["Des photos ou vidéos n'apparaissent pas", "« Photos et vidéos des collections » liste les fichiers introuvables."],
  ["L'envoi d'une photo ou d'une vidéo échoue", "« Stockage : envoi » et « Fichiers du site » (filigranes)."],
  ["Le site est fermé, ou ne ferme pas", "« Maintenance : état et comportement réel du site »."],
];

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: TIME_ZONE });
}

export default function AdminHealth({ quotaAlerts, quotaReady }) {
  const tests = useMemo(() => buildTests(), []);
  const blank = useMemo(
    () => tests.map((t) => ({ id: t.id, group: t.group, label: t.label, status: STATUS.PENDING, detail: "", cause: "", action: "", ms: 0, data: null })),
    [tests]
  );
  const [results, setResults] = useState(blank);
  const [running, setRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [conclusions, setConclusions] = useState([]);
  const [meta, setMeta] = useState(null);
  const [options, setOptions] = useState({ storageWrite: true, media: true });
  const [copied, setCopied] = useState("");
  const stopRef = useRef(false);

  // ---- Journal des erreurs ----
  const [hours, setHours] = useState(168);
  const [journal, setJournal] = useState({ rows: [], loading: true, error: "" });
  const [journalToast, setJournalToast] = useState("");

  const loadJournal = useCallback(async () => {
    setJournal((j) => ({ ...j, loading: true, error: "" }));
    const { data, error } = await supabase.rpc("admin_client_errors", { hours, max_rows: 50 });
    if (error) {
      const msg = String(error.message || "");
      setJournal({
        rows: [],
        loading: false,
        error: /could not find the function|schema cache/i.test(msg)
          ? "Le journal des erreurs n'est pas installé. Exécutez le script supabase_admin_diagnostic.sql dans Supabase (SQL Editor)."
          : msg,
      });
      return;
    }
    setJournal({ rows: data || [], loading: false, error: "" });
  }, [hours]);

  useEffect(() => {
    loadJournal();
  }, [loadJournal]);

  // À l'ouverture de l'onglet : purge discrète des rapports de plus de 30 jours
  useEffect(() => {
    supabase.rpc("admin_purge_client_errors", { days: 30 }).then(() => {}, () => {});
  }, []);

  useEffect(() => {
    if (!journalToast) return undefined;
    const t = setTimeout(() => setJournalToast(""), 3500);
    return () => clearTimeout(t);
  }, [journalToast]);

  const purge = async (days) => {
    if (days === 0 && !window.confirm("Vider tout le journal des erreurs ?")) return;
    const { data, error } = await supabase.rpc("admin_purge_client_errors", { days });
    setJournalToast(error ? "Purge impossible : " + error.message : (Number(data) || 0) + " rapport(s) supprimé(s).");
    loadJournal();
  };

  // ---- Diagnostic ----
  const createAnon = useCallback(
    () =>
      createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
        auth: { storageKey: "zenoria-diag-anon", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      }),
    []
  );

  const run = async () => {
    setRunning(true);
    setHasRun(true);
    setCopied("");
    setConclusions([]);
    stopRef.current = false;
    setDiagnosticMode(true); // les échecs voulus ne polluent pas le journal des erreurs
    const startedAt = Date.now();
    const env = {
      supabase,
      createAnon,
      getMediaUrl,
      mediaBucket: PRODUCT_MEDIA_BUCKET,
      fetchFn: (...args) => window.fetch(...args),
      window,
      document: window.document,
      navigator: window.navigator,
      location: window.location,
      videoSupport,
      quotaAlerts: quotaAlerts || [],
      quotaReady: Boolean(quotaReady),
      options: { ...options, maxMedia: 80 },
      now: () => Date.now(),
    };
    try {
      const final = await runDiagnostics(tests, env, { onUpdate: setResults, shouldStop: () => stopRef.current });
      setConclusions(synthesize(final));
      setMeta({
        startedAt,
        durationMs: Date.now() - startedAt,
        origin: window.location.origin,
        agent: uaFamily(window.navigator.userAgent),
        options,
      });
    } finally {
      setDiagnosticMode(false);
      setRunning(false);
      loadJournal();
    }
  };

  const summary = summarize(results);
  const worst = summary.fail > 0 ? "fail" : summary.warn > 0 ? "warn" : "ok";

  const copyText = async (key, text) => {
    try {
      await window.navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(""), 2500);
    } catch (e) {
      setCopied("error");
    }
  };

  const copyReport = () => copyText("report", formatReport(results, conclusions, meta));
  const healthUrl = typeof window !== "undefined" ? window.location.origin + "/api/health?deep=1" : "/api/health?deep=1";

  return (
    <>
      <div className="flex flex-wrap justify-between items-center mb-5 gap-3">
        <div>
          <h1 className="font-serif text-2xl">Santé du système</h1>
          <p className="text-sm text-[#8b737e]">Teste la chaîne complète et indique où se trouve le problème</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasRun && !running && (
            <button
              type="button"
              onClick={copyReport}
              data-testid="health-copy"
              className="flex items-center gap-1.5 rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] px-4 h-10 text-sm"
            >
              <Copy size={14} /> {copied === "report" ? "Rapport copié" : copied === "error" ? "Copie impossible" : "Copier le rapport"}
            </button>
          )}
          <button
            type="button"
            onClick={run}
            disabled={running}
            data-testid="health-run"
            className="flex items-center gap-1.5 rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-5 h-10 text-sm disabled:opacity-60"
          >
            <RefreshCw size={15} className={running ? "animate-spin" : ""} /> {running ? "Diagnostic en cours..." : hasRun ? "Relancer le diagnostic" : "Lancer le diagnostic"}
          </button>
        </div>
      </div>

      <div className="rounded-xl bg-[#faf6f8] border border-[#eee2e5] px-4 py-3 text-[12px] leading-5 text-[#54434c] mb-5">
        Les tests partent de <strong>votre navigateur</strong> : sur le réseau de l&apos;entreprise, certains services peuvent être bloqués. Le site (Vercel) refait lui-même
        la vérification de Supabase et les deux résultats sont comparés dans la conclusion.
        <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={options.storageWrite} disabled={running} onChange={(e) => setOptions({ ...options, storageWrite: e.target.checked })} data-testid="opt-storage" className="h-3.5 w-3.5" />
            Envoyer puis supprimer un fichier test dans le stockage
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={options.media} disabled={running} onChange={(e) => setOptions({ ...options, media: e.target.checked })} data-testid="opt-media" className="h-3.5 w-3.5" />
            Contrôler toutes les photos et vidéos
          </label>
        </div>
      </div>

      {hasRun && (
        <section
          data-testid="health-summary"
          data-level={running ? "running" : worst}
          className={`mb-6 rounded-2xl border px-5 py-4 ${
            running ? "bg-sky-50 border-sky-100" : worst === "fail" ? "bg-red-50 border-red-200" : worst === "warn" ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-100"
          }`}
        >
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <strong>{running ? "Diagnostic en cours..." : worst === "fail" ? "Au moins une panne détectée" : worst === "warn" ? "Points d'attention" : "Tout est en ordre"}</strong>
            <span className="text-[12px] text-[#54434c]" data-testid="health-counts">
              {summary.ok} OK · {summary.warn} attention · {summary.fail} panne · {summary.skip} non testé
              {meta && !running ? " · " + (meta.durationMs / 1000).toFixed(1).replace(".", ",") + " s" : ""}
            </span>
          </div>
          {!running && conclusions.length > 0 && (
            <div className="mt-3" data-testid="health-conclusion">
              <div className="text-[10px] uppercase tracking-widest text-[#8b737e] mb-1">Conclusion probable</div>
              <ul className="space-y-1.5 text-[13px] leading-5">
                {conclusions.map((c, i) => (
                  <li key={i} className="flex gap-2" data-level={c.level}>
                    <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${c.level === "fail" ? "bg-red-500" : c.level === "warn" ? "bg-amber-500" : "bg-emerald-500"}`} />
                    <span>{c.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* Résultats par groupe */}
      <div className="space-y-5 mb-8">
        {GROUPS.map((g) => {
          const rows = results.filter((r) => r.group === g.id);
          if (!rows.length) return null;
          return (
            <section key={g.id} className="rounded-2xl bg-white border border-[#eee2e5] overflow-hidden">
              <h2 className="px-4 py-2.5 bg-[#f5edf1] text-[11px] uppercase tracking-widest text-[#8b737e]">{g.label}</h2>
              <ul>
                {rows.map((r) => (
                  <li key={r.id} data-testid={`test-${r.id}`} data-status={r.status} className="px-4 py-3 border-t border-[#eee2e5] first:border-t-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] whitespace-nowrap ${CHIP[r.status]}`}>
                        {hasRun || r.status !== STATUS.PENDING ? STATUS_LABEL[r.status] : "À lancer"}
                      </span>
                      <span className="text-sm font-medium">{r.label}</span>
                      {r.ms > 0 && <span className="text-[11px] text-[#8b737e] tabular-nums">{r.ms} ms</span>}
                    </div>
                    {r.detail && <p className="text-[12px] text-[#54434c] mt-1.5 leading-5 break-words">{r.detail}</p>}
                    {(r.status === STATUS.WARN || r.status === STATUS.FAIL) && (r.cause || r.action) && (
                      <div className="mt-2 rounded-lg bg-[#faf6f8] px-3 py-2 text-[12px] leading-5 text-[#54434c]">
                        {r.cause && (
                          <div>
                            <strong>Cause probable :</strong> {r.cause}
                          </div>
                        )}
                        {r.action && (
                          <div>
                            <strong>Action :</strong> {r.action}
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {/* Journal des erreurs */}
      <section className="mb-8">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
          <div>
            <h2 className="font-serif text-xl">Erreurs rencontrées par les visiteurs</h2>
            <p className="text-[11px] text-[#8b737e] leading-4 max-w-xl">
              Type, message nettoyé, page et famille de navigateur. Jamais d&apos;adresse IP, d&apos;e-mail, de compte ni de panier. Les erreurs identiques sont regroupées et conservées 30 jours.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select value={hours} onChange={(e) => setHours(Number(e.target.value))} aria-label="Période" data-testid="journal-period" className="rounded-lg border border-[#eadfe4] bg-white px-2 h-9 outline-none">
              <option value={24}>24 dernières heures</option>
              <option value={168}>7 derniers jours</option>
              <option value={720}>30 derniers jours</option>
            </select>
            <button type="button" onClick={loadJournal} className="rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] px-3 h-9">Actualiser</button>
            <button type="button" onClick={() => purge(30)} data-testid="journal-purge" className="rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] px-3 h-9">Purger (&gt; 30 jours)</button>
            <button type="button" onClick={() => purge(0)} data-testid="journal-clear" className="rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] text-red-600 px-3 h-9">Tout effacer</button>
          </div>
        </div>
        {journalToast && <div className="mb-3 rounded-xl bg-emerald-50 text-emerald-700 px-4 py-2 text-sm">{journalToast}</div>}
        {journal.error && <div className="mb-3 rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm" role="alert">{journal.error}</div>}
        <div className="rounded-2xl bg-white border border-[#eee2e5] overflow-x-auto">
          <table className="w-full text-xs min-w-[640px]" data-testid="journal-table">
            <thead>
              <tr className="bg-[#f5edf1] text-left text-[#8b737e]">
                <th className="px-3 py-2.5 font-medium">Dernière fois</th>
                <th className="px-3 py-2.5 font-medium">Type</th>
                <th className="px-3 py-2.5 font-medium">Message</th>
                <th className="px-3 py-2.5 font-medium">Page</th>
                <th className="px-3 py-2.5 font-medium">Navigateur</th>
                <th className="px-3 py-2.5 font-medium text-right">Fois</th>
              </tr>
            </thead>
            <tbody>
              {!journal.loading && !journal.error && journal.rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-5 text-center text-[#8b737e]">Aucune erreur signalée sur cette période.</td>
                </tr>
              )}
              {journal.rows.map((r) => (
                <tr key={r.id} className="border-t border-[#eee2e5] align-top">
                  <td className="px-3 py-2.5 whitespace-nowrap">{formatDateTime(r.last_seen)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{KIND_LABEL[r.kind] || r.kind}</td>
                  <td className="px-3 py-2.5 break-words max-w-[360px]">{r.message}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{r.path}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{r.agent || "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.occurrences}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Surveillance externe */}
      <section className="rounded-2xl bg-white border border-[#eee2e5] p-5 mb-8">
        <h2 className="font-serif text-xl mb-1">Surveillance externe</h2>
        <p className="text-[12px] text-[#756a70] leading-5 mb-3">
          Un site en panne ne peut pas s&apos;alerter lui-même. Un service de sonde externe (gratuit, à choisir) peut interroger l&apos;adresse ci-dessous toutes les 5 minutes et vous prévenir si elle ne répond pas
          « 200 ». La réponse est <strong>503</strong> quand Supabase ne répond pas. Vérifiez les conditions du service choisi avant de l&apos;adopter.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input readOnly value={healthUrl} aria-label="Adresse de la sonde" data-testid="health-url" onFocus={(e) => e.target.select()} className="flex-1 min-w-[220px] rounded-xl border border-[#eadfe4] bg-[#faf6f8] px-3 h-10 text-xs outline-none" />
          <button type="button" onClick={() => copyText("url", healthUrl)} className="flex items-center gap-1.5 rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] px-4 h-10 text-sm">
            <Copy size={14} /> {copied === "url" ? "Copié" : "Copier"}
          </button>
        </div>
        <p className="text-[11px] text-[#8b737e] mt-2 leading-4">
          Statuts officiels : <a className="underline" href="https://www.vercel-status.com" target="_blank" rel="noopener noreferrer">Vercel</a> ·{" "}
          <a className="underline" href="https://status.supabase.com" target="_blank" rel="noopener noreferrer">Supabase</a>.
        </p>
      </section>

      {/* Aide-mémoire */}
      <section className="rounded-2xl bg-[#faf6f8] border border-[#eee2e5] p-5 text-[13px] leading-5 text-[#54434c]">
        <h2 className="font-serif text-lg mb-2">Quel test regarder selon le symptôme ?</h2>
        <ul className="space-y-1.5">
          {SYMPTOMS.map(([s, t]) => (
            <li key={s}>
              <strong>{s}</strong> — {t}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12px] text-[#8b737e]">
          Ce diagnostic échantillonne la chaîne : un résultat « tout est en ordre » ne prouve pas que tout fonctionne pour tous les visiteurs.
        </p>
      </section>
    </>
  );
}
