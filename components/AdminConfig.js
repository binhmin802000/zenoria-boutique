// ZENORIA_CONFIG_C1_V1 : onglet Accueil › Configuration (lecture seule).
// Montre l'état de chaque réglage du site, regroupé par thème. Chaque carte renvoie vers l'écran qui permet de le modifier.
import React from "react";
import { RefreshCw } from "lucide-react";
import { isMaintenanceActive } from "@/components/AdminMaintenance";
import { useSiteConfig, buildConfigOverview, setSiteMediaTarget } from "@/lib/configOverview"; // ZENORIA_CONFIG_C1B_V1

const TONES = { ok: "text-emerald-700", warn: "text-amber-800", crit: "text-red-600 font-medium" };

function flagLabel(f) {
  return f === true ? "Activé" : f === false ? "Désactivé" : "Non défini";
}
function flagClass(f) {
  return f === true ? "bg-emerald-50 text-emerald-700" : f === false ? "bg-[#f0e6ea] text-[#8b737e]" : "bg-amber-50 text-amber-800";
}

// Affichage seul (testable sans réseau)
export function ConfigView({ sections, loaded, loading, error, onGo, onReload }) {
  return (
    <div data-testid="admin-config">
      <div className="flex justify-between items-center mb-5 gap-3">
        <div>
          <h1 className="font-serif text-2xl">Configuration du site</h1>
          <p className="text-sm text-[#8b737e]">L&apos;état de chaque réglage. Lecture seule : chaque réglage se modifie sur son écran (lien « Modifier »).</p>
        </div>
        <button
          type="button"
          onClick={onReload}
          disabled={loading}
          data-testid="config-refresh"
          className="flex items-center gap-1.5 rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] px-4 h-10 text-sm disabled:opacity-60"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Actualiser
        </button>
      </div>

      {error ? (
        <div role="alert" data-testid="config-error" className="mb-5 rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}
      {!loaded ? (
        <p className="text-sm text-[#8b737e]" data-testid="config-loading">
          Chargement…
        </p>
      ) : null}

      {loaded && !error ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" data-testid="config-grid">
          {sections.map((s) => (
            <section key={s.id} className="rounded-2xl bg-white border border-[#eee2e5] px-4 py-3.5" data-testid={"config-card-" + s.id}>
              <div className="flex justify-between items-baseline gap-3">
                <h2 className="font-serif text-lg">{s.title}</h2>
                <button
                  type="button"
                  onClick={() => {
                    setSiteMediaTarget(s.link.anchor || null); // ZENORIA_CONFIG_C1B_V1 : ouvre la bonne section de « Contenu du site »
                    onGo(s.link.group, s.link.tab);
                  }}
                  data-testid={"config-link-" + s.id}
                  title={s.link.where ? "Ouvre " + s.link.where : undefined}
                  className="text-xs text-[#8f6075] underline shrink-0"
                >
                  Modifier ›
                </button>
              </div>
              <div className="text-[11px] text-[#8b737e] mb-1.5">
                {s.keys}
                {s.link.where ? " · " + s.link.where : ""}
              </div>
              {s.items.map((it) => (
                <div
                  key={it.id}
                  data-testid={"config-item-" + it.id}
                  className="flex items-center justify-between gap-3 py-2 border-t border-[#f3eaee] first:border-t-0 text-sm"
                >
                  <div className="min-w-0">
                    <div className="font-medium">{it.label}</div>
                    {it.sub ? <div className="text-[11px] text-[#8b737e]">{it.sub}</div> : null}
                  </div>
                  <div className="shrink-0 text-right">
                    {it.flag !== undefined ? (
                      <span
                        data-state={it.flag === true ? "on" : it.flag === false ? "off" : "unknown"}
                        className={"inline-block rounded-full px-2.5 py-0.5 text-xs " + flagClass(it.flag)}
                      >
                        {flagLabel(it.flag)}
                      </span>
                    ) : (
                      <span className={"text-[13px] " + (it.missing ? "text-[#8b737e] italic" : TONES[it.tone] || "text-[#54434c]")}>{it.text}</span>
                    )}
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function AdminConfig({ onGo, maintenance }) {
  const cfg = useSiteConfig();
  const m = maintenance || {};
  const maint = {
    loading: Boolean(m.loading),
    error: m.error || "",
    row: m.row || null,
    active: m.row ? isMaintenanceActive(m.row, Date.now()) : false,
  };
  const sections = buildConfigOverview({ rows: cfg.rows, meta: cfg.meta, maintenance: maint });
  return <ConfigView sections={sections} loaded={cfg.loaded} loading={cfg.loading} error={cfg.error} onGo={onGo} onReload={cfg.reload} />;
}
