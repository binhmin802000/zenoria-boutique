import React, { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatBytes } from "@/lib/quota";
import {
  RECENT_MINUTES,
  SORTS,
  baseName,
  classifyFiles,
  deleteOrphans,
  loadOrphanData,
  sortOrphans,
} from "@/lib/orphanFiles";

// ============================================================
// SECTION « FICHIERS ORPHELINS » de l'onglet Quotas (Technique > Quotas)
//
// Liste les fichiers du stockage que RIEN n'utilise (ni une collection, ni le contenu du site), pour les cocher et les
// supprimer et récupérer de l'espace. Supprimer un fichier orphelin ne change rien à l'affichage du site.
//
// La liste vient de la fonction SQL admin_storage_files (voir supabase_admin_storage_files.sql). Les fichiers utilisés
// ne sont jamais proposés. La suppression est définitive : il n'y a pas de corbeille.
// La logique est dans lib/orphanFiles.js.
// ============================================================

const TIME_ZONE = "Europe/Paris";

function formatDate(value) {
  if (!value) return "date inconnue";
  return new Date(value).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: TIME_ZONE });
}

function ageLabel(minutes) {
  if (minutes === null) return "";
  if (minutes < 1) return "à l'instant";
  return "il y a " + Math.round(minutes) + " min";
}

const KIND_LABEL = { image: "Photo", video: "Vidéo", other: "Autre" };
const KIND_STYLE = { image: "bg-sky-50 text-sky-700", video: "bg-violet-50 text-violet-700", other: "bg-[#f0e6ea] text-[#8b737e]" };

export default function AdminStorageOrphans({ onChanged }) {
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [selected, setSelected] = useState(() => new Set());
  const [sortKey, setSortKey] = useState("size");
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [result, setResult] = useState(null);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: "" }));
    const r = await loadOrphanData(supabase);
    if (r.error) {
      setState({ loading: false, error: r.error, data: null });
      return;
    }
    setState({ loading: false, error: "", data: classifyFiles(r) });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const orphans = useMemo(() => (state.data ? sortOrphans(state.data.orphans, sortKey) : []), [state.data, sortKey]);
  const selectable = useMemo(() => orphans.filter((o) => o.selectable), [orphans]);
  const chosen = useMemo(() => orphans.filter((o) => selected.has(o.path)), [orphans, selected]);
  const chosenBytes = chosen.reduce((s, o) => s + o.size, 0);
  const lockedCount = orphans.length - selectable.length;

  // Une sélection ne garde que des fichiers qui existent encore dans la liste
  useEffect(() => {
    setSelected((prev) => {
      const valid = new Set(selectable.map((o) => o.path));
      const next = new Set([...prev].filter((p) => valid.has(p)));
      return next.size === prev.size ? prev : next;
    });
  }, [selectable]);

  const toggle = (path) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const allChecked = selectable.length > 0 && chosen.length === selectable.length;
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(selectable.map((o) => o.path)));

  const runDelete = async () => {
    setDeleting(true);
    const r = await deleteOrphans(supabase, chosen);
    setDeleting(false);
    setConfirming(false);
    setResult(r);
    setSelected(new Set());
    await load();
    if (typeof onChanged === "function") onChanged();
  };

  const data = state.data;

  return (
    <section className="mb-8" data-testid="orphans">
      <div className="flex justify-between items-start gap-3 mb-3">
        <div>
          <h2 className="font-serif text-xl">Fichiers orphelins</h2>
          <p className="text-xs text-[#8b737e] mt-1 max-w-2xl leading-5">
            Fichiers du stockage que ni une collection ni le contenu du site n&apos;utilise : envois abandonnés, médias remplacés, fichiers de
            test. Les supprimer ne change rien sur le site et libère de l&apos;espace.
          </p>
        </div>
        <button
          onClick={load}
          disabled={state.loading || deleting}
          className="shrink-0 flex items-center gap-1.5 rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] px-4 h-9 text-sm disabled:opacity-60"
          data-testid="orphans-refresh"
        >
          <RefreshCw size={14} className={state.loading ? "animate-spin" : ""} /> Actualiser
        </button>
      </div>

      {result && (
        <div className="mb-4 rounded-xl border border-[#eee2e5] bg-white px-4 py-3 text-sm" role="status" data-testid="orphans-result">
          {result.error ? (
            <div className="text-red-600">Aucun fichier supprimé : {result.error}</div>
          ) : (
            <>
              <div className={result.removed.length ? "text-emerald-700" : "text-[#54434c]"}>
                {result.removed.length > 0
                  ? `${result.removed.length} fichier${result.removed.length > 1 ? "s" : ""} supprimé${result.removed.length > 1 ? "s" : ""} · ${formatBytes(result.bytesFreed)} d'espace libéré.`
                  : "Aucun fichier supprimé."}
              </div>
              {result.skippedUsed.length > 0 && (
                <div className="text-amber-700 mt-1">
                  {result.skippedUsed.length} fichier{result.skippedUsed.length > 1 ? "s" : ""} conservé{result.skippedUsed.length > 1 ? "s" : ""} : devenu{result.skippedUsed.length > 1 ? "s" : ""} utilisé{result.skippedUsed.length > 1 ? "s" : ""} entre-temps par une collection ou le contenu du site.
                </div>
              )}
              {result.skippedRecent.length > 0 && (
                <div className="text-amber-700 mt-1">
                  {result.skippedRecent.length} fichier{result.skippedRecent.length > 1 ? "s" : ""} conservé{result.skippedRecent.length > 1 ? "s" : ""} : envoyé{result.skippedRecent.length > 1 ? "s" : ""} il y a moins d&apos;une heure.
                </div>
              )}
              {result.failed.length > 0 && (
                <div className="text-red-600 mt-1">
                  {result.failed.length} fichier{result.failed.length > 1 ? "s" : ""} non supprimé{result.failed.length > 1 ? "s" : ""} :
                  <ul className="list-disc pl-5 text-xs mt-1">
                    {result.failed.slice(0, 5).map((f) => (
                      <li key={f.path} className="break-all">{f.path} — {f.message}</li>
                    ))}
                    {result.failed.length > 5 && <li>… et {result.failed.length - 5} autre(s)</li>}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {state.error && (
        <div className="rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm" role="alert" data-testid="orphans-error">{state.error}</div>
      )}

      {state.loading && !data && <p className="text-sm text-[#8b737e]">Analyse des fichiers du stockage…</p>}

      {data && (
        <div className="rounded-2xl bg-white border border-[#eee2e5] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#f0e6ea] text-sm" data-testid="orphans-summary">
            {orphans.length === 0 ? (
              <span className="text-emerald-700">Aucun fichier orphelin : tous les fichiers du stockage sont utilisés.</span>
            ) : (
              <span>
                <strong>{orphans.length}</strong> fichier{orphans.length > 1 ? "s" : ""} orphelin{orphans.length > 1 ? "s" : ""} ·{" "}
                <strong>{formatBytes(data.totalBytes)}</strong> à récupérer
              </span>
            )}
            <span className="text-xs text-[#8b737e]">
              {" "}
              · {data.used} fichier{data.used > 1 ? "s" : ""} utilisé{data.used > 1 ? "s" : ""} par le site (non proposé{data.used > 1 ? "s" : ""})
            </span>
            {data.broken > 0 && (
              <div className="text-xs text-amber-700 mt-1" data-testid="orphans-broken">
                {data.broken} référence{data.broken > 1 ? "s" : ""} vers un fichier absent : à vérifier dans Technique, Santé (test « Photos et vidéos des collections »).
              </div>
            )}
            {data.broken === null && (
              <div className="text-xs text-[#8b737e] mt-1">Liste limitée aux 2 000 fichiers les plus récents : les références cassées ne sont pas contrôlées.</div>
            )}
          </div>

          {orphans.length > 0 && (
            <>
              <div className="px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 bg-[#faf6f8] text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="h-4 w-4" checked={allChecked} disabled={selectable.length === 0 || deleting} onChange={toggleAll} data-testid="orphans-all" />
                  <span>Tout cocher</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-[#756a70] ml-auto">
                  Trier
                  <select
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value)}
                    className="rounded-lg border border-[#eadfe4] bg-white px-2 h-8 text-sm text-[#342b32] outline-none focus:border-[#8f6075]"
                    data-testid="orphans-sort"
                  >
                    {Object.entries(SORTS).map(([k, s]) => (
                      <option key={k} value={k}>{s.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              <ul className="divide-y divide-[#f0e6ea]" data-testid="orphans-list">
                {orphans.map((o) => (
                  <li key={o.path} className={`px-4 py-2.5 flex items-start gap-3 ${o.selectable ? "" : "bg-[#fcfafb]"}`} data-testid="orphan-row" data-path={o.path}>
                    <input
                      type="checkbox"
                      className="h-4 w-4 mt-1 shrink-0"
                      checked={selected.has(o.path)}
                      disabled={!o.selectable || deleting}
                      onChange={() => toggle(o.path)}
                      aria-label={`Cocher ${o.path}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm break-all leading-5">
                        <span className="text-[#8b737e]">{o.folder} / </span>
                        {baseName(o.path)}
                      </div>
                      <div className="text-xs text-[#8b737e] mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className={`rounded-full px-2 py-0.5 ${KIND_STYLE[o.kind]}`}>{KIND_LABEL[o.kind]}</span>
                        <span>Envoyé le {formatDate(o.createdAt)}</span>
                        {!o.selectable && (
                          <span className="text-amber-700" data-testid="orphan-locked">
                            envoyé {ageLabel(o.ageMinutes)} : peut être utilisé par une collection en cours de modification, réessayez dans {Math.max(1, Math.ceil(RECENT_MINUTES - o.ageMinutes))} min
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-sm tabular-nums whitespace-nowrap">{formatBytes(o.size)}</div>
                  </li>
                ))}
              </ul>

              <div className="px-4 py-3 border-t border-[#f0e6ea] flex flex-wrap items-center gap-3">
                <button
                  onClick={() => setConfirming(true)}
                  disabled={chosen.length === 0 || deleting}
                  className="flex items-center gap-1.5 rounded-full bg-red-600 hover:bg-red-700 text-white px-5 h-10 text-sm disabled:opacity-40 disabled:hover:bg-red-600"
                  data-testid="orphans-delete"
                >
                  <Trash2 size={15} />
                  {chosen.length === 0 ? "Supprimer la sélection" : `Supprimer ${chosen.length} fichier${chosen.length > 1 ? "s" : ""} (${formatBytes(chosenBytes)})`}
                </button>
                {lockedCount > 0 && (
                  <span className="text-xs text-[#8b737e]">
                    {lockedCount} fichier{lockedCount > 1 ? "s" : ""} envoyé{lockedCount > 1 ? "s" : ""} il y a moins d&apos;une heure : non sélectionnable{lockedCount > 1 ? "s" : ""} pour l&apos;instant.
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {confirming && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => !deleting && setConfirming(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="orphans-confirm-title"
            className="fixed z-50 inset-x-4 top-[12%] max-w-md mx-auto bg-white rounded-[1.5rem] shadow-2xl p-6"
            data-testid="orphans-confirm"
          >
            <div className="flex justify-between items-start mb-3">
              <h3 id="orphans-confirm-title" className="font-serif text-xl">
                Supprimer {chosen.length} fichier{chosen.length > 1 ? "s" : ""} ?
              </h3>
              <button onClick={() => setConfirming(false)} disabled={deleting} className="h-8 w-8 grid place-items-center rounded-full hover:bg-[#f0e6ea]" aria-label="Fermer">
                <X size={16} />
              </button>
            </div>
            <p className="text-sm text-[#54434c] leading-6">
              {formatBytes(chosenBytes)} d&apos;espace seront libérés. Ces fichiers ne sont utilisés par aucune collection ni par le contenu du site : le site ne
              changera pas.
            </p>
            <ul className="mt-3 text-xs text-[#756a70] space-y-1 max-h-32 overflow-y-auto" data-testid="orphans-confirm-list">
              {chosen.slice(0, 6).map((o) => (
                <li key={o.path} className="break-all">{o.path}</li>
              ))}
              {chosen.length > 6 && <li>… et {chosen.length - 6} autre{chosen.length - 6 > 1 ? "s" : ""}</li>}
            </ul>
            <p className="mt-3 text-xs text-red-600">Il n&apos;y a pas de corbeille : cette action est irréversible.</p>
            <div className="flex gap-3 mt-5">
              <button
                onClick={runDelete}
                disabled={deleting}
                className="flex-1 rounded-full bg-red-600 hover:bg-red-700 text-white h-11 text-sm font-medium disabled:opacity-60"
                data-testid="orphans-confirm-yes"
              >
                {deleting ? "Suppression…" : "Supprimer définitivement"}
              </button>
              <button onClick={() => setConfirming(false)} disabled={deleting} className="rounded-full border border-[#d9c5cc] px-6 h-11 text-sm">
                Annuler
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
