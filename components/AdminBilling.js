import React, { useCallback, useEffect, useState } from "react";
import { Receipt, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { SITE_SETTINGS_TABLE } from "@/lib/siteSettings";
import { BILLING_KEY, parseBillingSetting, buildBillingValue, sameBillingSetting, billingMissingFields } from "@/lib/billingSettings";

// ============================================================
// CARTE « FACTURATION » (Admin › CRM › Commandes) — ZENORIA_BILLING_STEP2_V1
//
// Réglages lus par la fonction SQL issue_invoice_for_order (supabase_invoices.sql) au moment où une
// facture est émise pour la première fois. Changer ce réglage n'affecte jamais une facture déjà
// émise (table invoices, verrouillée après création) : seulement les prochaines factures.
//
// Option A (validée) : activer la TVA ne change pas les prix affichés aux clientes ; la TVA est
// calculée comme incluse dans ces prix au moment de l'émission de chaque facture.
// ============================================================

const TIME_ZONE = "Europe/Paris";

function formatDateTime(value) {
  if (!value) return null;
  return new Date(value).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: TIME_ZONE });
}

function friendlyError(err) {
  const msg = (err && err.message) || String(err || "");
  if (/site_settings_billing_valid|violates check constraint/i.test(msg)) {
    return "La base refuse cette valeur. Vérifiez que le script supabase_invoices.sql a bien été exécuté dans Supabase.";
  }
  if (/row-level security|permission denied|not authorized|unauthorized/i.test(msg)) {
    return "Enregistrement refusé : ce compte n'a pas les droits d'administration.";
  }
  return msg;
}

export default function AdminBilling() {
  const [row, setRow] = useState(null);
  const [draft, setDraft] = useState({ ...parseBillingSetting(null) });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await supabase.from(SITE_SETTINGS_TABLE).select("*").eq("key", BILLING_KEY).maybeSingle();
      if (res.error) {
        setLoadError(friendlyError(res.error));
      } else {
        setRow(res.data || null);
        setDraft(parseBillingSetting(res.data ? res.data.value : null));
      }
    } catch (err) {
      setLoadError(friendlyError(err));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const saved = parseBillingSetting(row ? row.value : null);
  const dirty = !sameBillingSetting(draft, saved);
  const disabled = loading || Boolean(loadError) || saving;
  const missing = billingMissingFields(draft);
  const rateInvalid = draft.vat_enabled && !(Number(draft.vat_rate) >= 0 && Number(draft.vat_rate) <= 100);

  const setField = (key, value) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setError("");
  };

  const save = async () => {
    if (rateInvalid) {
      setError("Le taux de TVA doit être compris entre 0 et 100.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const { error: err } = await supabase
        .from(SITE_SETTINGS_TABLE)
        .upsert({ key: BILLING_KEY, value: buildBillingValue(draft) }, { onConflict: "key" });
      if (err) throw err;
      setToast("Réglages de facturation enregistrés. Les prochaines factures émises en tiendront compte.");
      await load();
    } catch (err) {
      setError("Échec de l'enregistrement : " + friendlyError(err));
    }
    setSaving(false);
  };

  const cancel = () => setDraft(saved);

  const savedAt = row ? formatDateTime(row.updated_at) : null;
  const inputCls = "mt-1 w-full rounded-xl border border-[#eadfe4] focus:border-[#8f6075] px-3 h-10 text-sm outline-none bg-white disabled:opacity-60";

  return (
    <section data-testid="billing-panel" className="rounded-2xl bg-white border border-[#eee2e5] p-5 mb-6">
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0">
          <h2 className="font-serif text-xl flex items-center gap-2">
            <Receipt size={18} className="text-[#8f6075]" /> Facturation
          </h2>
          <p className="text-xs text-[#8b737e] mt-1 leading-4">
            Identité affichée sur les factures et TVA applicable. Activer la TVA ne change pas les prix affichés aux
            clientes : elle est calculée comme incluse dans ces prix. Une facture déjà émise ne change jamais.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          aria-label="Actualiser les réglages de facturation"
          className="shrink-0 h-9 w-9 grid place-items-center rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] disabled:opacity-60"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 mt-4">
        <div>
          <label className="text-xs text-[#54434c] font-medium" htmlFor="seller_name">Nom du vendeur</label>
          <input
            id="seller_name"
            type="text"
            value={draft.seller_name}
            disabled={disabled}
            onChange={(e) => setField("seller_name", e.target.value)}
            placeholder="À compléter"
            className={inputCls}
          />
        </div>
        <div>
          <label className="text-xs text-[#54434c] font-medium" htmlFor="seller_siret">SIRET</label>
          <input
            id="seller_siret"
            type="text"
            value={draft.seller_siret}
            disabled={disabled}
            onChange={(e) => setField("seller_siret", e.target.value)}
            placeholder="À compléter"
            className={inputCls}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs text-[#54434c] font-medium" htmlFor="seller_address">Adresse</label>
          <input
            id="seller_address"
            type="text"
            value={draft.seller_address}
            disabled={disabled}
            onChange={(e) => setField("seller_address", e.target.value)}
            placeholder="À compléter"
            className={inputCls}
          />
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-[#eee2e5]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-[#412f3b]">Assujettie à la TVA</div>
            <div className="text-[11px] text-[#8b737e]">Désactivé : mention « TVA non applicable, art. 293 B du CGI » sur les factures.</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={draft.vat_enabled}
            aria-label="Assujettie à la TVA"
            onClick={() => setField("vat_enabled", !draft.vat_enabled)}
            disabled={disabled}
            data-testid="billing-vat-switch"
            className={`relative h-7 w-12 rounded-full transition-colors disabled:opacity-50 shrink-0 ${draft.vat_enabled ? "bg-emerald-600" : "bg-[#d9cfd3]"}`}
          >
            <span className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${draft.vat_enabled ? "translate-x-5" : ""}`} />
          </button>
        </div>

        {draft.vat_enabled && (
          <div className="grid sm:grid-cols-2 gap-4 mt-4">
            <div>
              <label className="text-xs text-[#54434c] font-medium" htmlFor="vat_rate">Taux de TVA (%)</label>
              <input
                id="vat_rate"
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={draft.vat_rate}
                disabled={disabled}
                onChange={(e) => setField("vat_rate", e.target.value === "" ? "" : Number(e.target.value))}
                aria-invalid={rateInvalid}
                className={`${inputCls} ${rateInvalid ? "border-red-300" : ""}`}
              />
            </div>
            <div>
              <label className="text-xs text-[#54434c] font-medium" htmlFor="seller_vat_number">N° de TVA intracommunautaire</label>
              <input
                id="seller_vat_number"
                type="text"
                value={draft.seller_vat_number}
                disabled={disabled}
                onChange={(e) => setField("seller_vat_number", e.target.value)}
                placeholder="À compléter"
                className={inputCls}
              />
            </div>
          </div>
        )}
      </div>

      {missing.length > 0 && (
        <div className="mt-4 rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-xs leading-5">
          À compléter avant une mise en ligne réelle : {missing.join(", ")}. En attendant, les factures afficheront « À compléter » à ces emplacements.
        </div>
      )}
      {toast && <div data-testid="billing-toast" className="mt-4 rounded-xl bg-emerald-50 text-emerald-700 px-4 py-3 text-sm">{toast}</div>}
      {loadError && <div role="alert" className="mt-4 rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm">{loadError}</div>}
      {error && <div role="alert" className="mt-4 rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm">{error}</div>}

      <div className="flex flex-wrap items-center gap-3 mt-5">
        <button
          type="button"
          onClick={save}
          disabled={disabled || !dirty || rateInvalid}
          data-testid="billing-save"
          className="rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-6 h-10 text-sm disabled:opacity-50 disabled:hover:bg-[#8f6075]"
        >
          {saving ? "Enregistrement..." : "Enregistrer"}
        </button>
        {dirty && !disabled && (
          <button type="button" onClick={cancel} className="rounded-full border border-[#d9c5cc] px-5 h-10 text-sm hover:bg-[#f5edf1]">
            Annuler
          </button>
        )}
        {!loadError && !loading && (
          <p className="text-[11px] text-[#54434c] leading-4">
            {savedAt && (
              <span className="text-[#8b737e]">
                Modifié le {savedAt}
                {row && row.updated_by_email ? ` · ${row.updated_by_email}` : ""}
              </span>
            )}
            {!row && <span className="text-[#8b737e]">Rien d&apos;enregistré (franchise en base par défaut)</span>}
          </p>
        )}
      </div>
    </section>
  );
}
