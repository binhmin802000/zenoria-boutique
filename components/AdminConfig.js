// ZENORIA_CONFIG_C1_V1 : onglet Accueil › Configuration (lecture seule).
// Montre l'état de chaque réglage du site, regroupé par thème. Chaque carte renvoie vers l'écran qui permet de le modifier.
import React from "react";
import { RefreshCw } from "lucide-react";
import { isMaintenanceActive } from "@/components/AdminMaintenance";
import { useSiteConfig, buildConfigOverview, setSiteMediaTarget } from "@/lib/configOverview"; // ZENORIA_CONFIG_C1B_V1
// ZENORIA_CONFIG_C5_V1 : historique des changements de réglages
import ConfigLog from "@/components/ConfigLog";
// ZENORIA_CONFIG_C2_V1 : interrupteurs simples
import FlagControl from "@/components/ConfigSwitch";
import { useConfigToggle } from "@/lib/configToggle";
import SensitiveSwitch from "@/components/SensitiveSwitch"; // ZENORIA_CONFIG_C3B_V1
import { setVatEnabled } from "@/lib/billingActions"; // ZENORIA_CONFIG_C3C_V1
import { setPaymentMethod, TransferNotReadyError } from "@/lib/paymentActions";
import { parsePaymentMethods, parseBankTransfer } from "@/lib/paymentSettings";

const TONES = { ok: "text-emerald-700", warn: "text-amber-800", crit: "text-red-600 font-medium" };

function flagLabel(f) {
  return f === true ? "Activé" : f === false ? "Désactivé" : "Non défini";
}
function flagClass(f) {
  return f === true ? "bg-emerald-50 text-emerald-700" : f === false ? "bg-[#f0e6ea] text-[#8b737e]" : "bg-amber-50 text-amber-800";
}

// Affichage seul (testable sans réseau)
export function ConfigView({ sections, loaded, loading, error, onGo, onReload, onToggle, busyId, notice, onSensitiveConfirm }) { // ZENORIA_CONFIG_C2_V1
  return (
    <div data-testid="admin-config">
      <div className="flex justify-between items-center mb-5 gap-3">
        <div>
          <h1 className="font-serif text-2xl">Configuration du site</h1>
          <p className="text-sm text-[#8b737e]">L&apos;état de chaque réglage. La livraison offerte, les avis et les canaux de contact se basculent ici ; le reste se modifie sur son écran (lien « Modifier »).</p>
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

      {/* ZENORIA_CONFIG_C2_V1 : résultat de la dernière bascule */}
      {notice ? (
        <div
          role={notice.type === "error" ? "alert" : "status"}
          data-testid="config-notice"
          className={"mb-5 rounded-xl px-4 py-3 text-[13px] border " + (notice.type === "error" ? "bg-red-50 border-red-200 text-red-700" : notice.type === "warn" ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-emerald-50 border-emerald-200 text-emerald-800")}
        >
          {notice.text}
        </div>
      ) : null}
      {loaded && !error ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" data-testid="config-grid">
          {sections.map((s) => (
            <section key={s.id} className="rounded-2xl bg-white border border-[#eee2e5] px-4 py-3.5" data-testid={"config-card-" + s.id}>
              <div className="flex justify-between items-baseline gap-3">
                <h2 className="font-serif text-lg">{s.title}</h2>
                {s.link ? ( /* ZENORIA_CONFIG_LINKS_V1 : pas de lien quand il n'y a aucun ecran dedie (Newsletter) */
                  <button
                    type="button"
                    onClick={() => {
                      setSiteMediaTarget(s.link.anchor || null, s.link.card || null); // ZENORIA_CONFIG_C1B_V1 : ouvre la bonne section de « Contenu du site » ; ZENORIA_CONFIG_LINKS_V1 : et la carte visee
                      onGo(s.link.group, s.link.tab);
                      if (!s.link.anchor && typeof window !== "undefined" && typeof window.scrollTo === "function") window.scrollTo({ top: 0, behavior: "smooth" }); // ZENORIA_CONFIG_LINKS_V1 : sans repere, on arrive en haut de l'onglet (et non sur son pied de page)
                    }}
                    data-testid={"config-link-" + s.id}
                    title={s.link.where ? "Ouvre " + s.link.where : undefined}
                    className="text-xs text-[#8f6075] underline shrink-0"
                  >
                    Modifier ›
                  </button>
                ) : null}
              </div>
              <div className="text-[11px] text-[#8b737e] mb-1.5">
                {s.keys}
                {s.link && s.link.where ? " · " + s.link.where : ""}
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
                  <div className={it.sensitive ? "min-w-0 w-80 max-w-[65%] text-left" : "shrink-0 text-right"}>
                    {it.flag !== undefined ? (
                      it.sensitive ? (
                        <SensitiveSwitch
                          id={it.id}
                          label={it.label}
                          checked={it.flag === true}
                          disabled={it.flag === null}
                          warningText={it.warningText}
                          onConfirm={(next) => onSensitiveConfirm(it.id, next)}
                        />
                      ) : (
                        <FlagControl it={it} busyId={busyId} onToggle={onToggle} />
                      )
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
  const toggle = useConfigToggle(cfg.rows, cfg.reload); // ZENORIA_CONFIG_C2_V1
  const m = maintenance || {};
  const maint = {
    loading: Boolean(m.loading),
    error: m.error || "",
    row: m.row || null,
    active: m.row ? isMaintenanceActive(m.row, Date.now()) : false,
  };
  const sections = buildConfigOverview({ rows: cfg.rows, meta: cfg.meta, maintenance: maint });

  // ZENORIA_CONFIG_C3B_V1 : Stripe et Virement passent par le même garde-fou que la carte
  // "Moyens de paiement" (AdminPaymentMethods.js), via la fonction partagée setPaymentMethod
  // (lib/paymentActions.js). Confirmation "BINHEMI" gérée par SensitiveSwitch lui-même.
  const handleSensitiveConfirm = async (id, next) => {
    if (id === "vat") { // ZENORIA_CONFIG_C3C_V1
      await setVatEnabled(next);
      cfg.reload();
      return;
    }
    if (id === "stripe" || id === "transfer") {
      const currentMethods = parsePaymentMethods(cfg.rows.payment_methods ? cfg.rows.payment_methods.value : null);
      const savedBank = parseBankTransfer(cfg.rows.bank_transfer ? cfg.rows.bank_transfer.value : null);
      const field = id === "stripe" ? "stripe_enabled" : "transfer_enabled";
      try {
        await setPaymentMethod(currentMethods, savedBank, field, next);
        cfg.reload();
      } catch (err) {
        throw err instanceof TransferNotReadyError ? err : new Error((err && err.message) || "Échec de l'enregistrement.");
      }
      return;
    }
    throw new Error("Réglage non pris en charge.");
  };

  return (
    <>
      <ConfigView
        sections={sections}
        loaded={cfg.loaded}
        loading={cfg.loading}
        error={cfg.error}
        onGo={onGo}
        onReload={cfg.reload}
        onToggle={toggle.run}
        busyId={toggle.busyId}
        notice={toggle.notice}
        onSensitiveConfirm={handleSensitiveConfirm}
      />
      {/* ZENORIA_CONFIG_C5_V1 */}
      {cfg.loaded && !cfg.error ? <ConfigLog refreshKey={cfg.rows} /> : null}
    </>
  );
}
