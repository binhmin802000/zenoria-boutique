// ZENORIA_CONFIG_C5_V1 : historique des changements de réglages (bas de l'onglet Accueil › Configuration). Lecture seule.
import React from "react";
import { RefreshCw } from "lucide-react";
import { useSettingsLog, describeLogEntry, formatLogWhen, LOG_LIMIT } from "@/lib/configLog";

// Affichage seul (testable sans réseau)
export function ConfigLogView({ entries, loaded, loading, error, onReload }) {
  const rows = (entries || []).map(describeLogEntry);
  return (
    <section className="mt-8" data-testid="config-log">
      <div className="flex justify-between items-center gap-3 mb-2">
        <h2 className="font-serif text-lg">Historique des changements de réglages</h2>
        <button
          type="button"
          onClick={onReload}
          disabled={loading}
          data-testid="config-log-refresh"
          className="flex items-center gap-1.5 rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] px-3 h-9 text-xs disabled:opacity-60"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Actualiser
        </button>
      </div>

      {error ? (
        <div role="alert" data-testid="config-log-error" className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 text-[13px]">
          {error}
        </div>
      ) : null}
      {!loaded && !error ? (
        <p className="text-sm text-[#8b737e]" data-testid="config-log-loading">
          Chargement…
        </p>
      ) : null}

      {loaded && !error ? (
        <>
          <div className="bg-white rounded-2xl border border-[#eee2e5] overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm" data-testid="config-log-table">
              <thead>
                <tr className="bg-[#f5edf1] text-left text-[#8b737e]">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Réglage</th>
                  <th className="px-4 py-3 font-medium">Changement</th>
                  <th className="px-4 py-3 font-medium">Auteur</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-[#8b737e]" data-testid="config-log-empty">
                      Aucun changement enregistré depuis l&apos;installation du journal.
                    </td>
                  </tr>
                ) : null}
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-[#eee2e5] align-top" data-testid="config-log-row">
                    <td className="px-4 py-3 whitespace-nowrap text-[12px] text-[#8b737e]">{formatLogWhen(r.when)}</td>
                    <td className="px-4 py-3 font-medium whitespace-nowrap">{r.label}</td>
                    <td className="px-4 py-3 text-[13px] text-[#54434c]">
                      {r.lines.map((l, i) => (
                        <div key={i}>{l}</div>
                      ))}
                      {r.more > 0 ? <div className="text-[11px] text-[#8b737e]">+ {r.more} autre{r.more > 1 ? "s" : ""}</div> : null}
                    </td>
                    <td className="px-4 py-3 text-[12px] text-[#54434c]">{r.author}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] leading-4 text-[#8b737e] mt-2">
            Les {LOG_LIMIT} derniers changements. Le journal ne contient que les changements faits depuis son installation. Les textes volumineux n&apos;y sont pas copiés
            (seule leur taille est indiquée) et l&apos;IBAN y est masqué. Les changements de maintenance sont enregistrés à part.
          </p>
        </>
      ) : null}
    </section>
  );
}

export default function ConfigLog({ refreshKey }) {
  const log = useSettingsLog(refreshKey);
  return <ConfigLogView entries={log.entries} loaded={log.loaded} loading={log.loading} error={log.error} onReload={log.reload} />;
}
