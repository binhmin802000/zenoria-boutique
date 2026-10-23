import React, { useCallback, useEffect, useState } from "react";
import { CreditCard, RefreshCw, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { SITE_SETTINGS_TABLE } from "@/lib/siteSettings";
import {
  PAYMENT_METHODS_KEY,
  BANK_TRANSFER_KEY,
  DELAY_MIN,
  DELAY_MAX,
  DEFAULT_BANK_TRANSFER,
  parsePaymentMethods,
  parseBankTransfer,
  buildBankTransferValue,
  sameBankTransfer,
  bankMissingFields,
  isTransferReady,
  isValidIban,
  isValidBic,
  isValidDelay,
  formatIban,
  normalizeIban,
} from "@/lib/paymentSettings";

// ============================================================
// CARTE « MOYENS DE PAIEMENT » (Admin › CRM › Commandes) — ZENORIA_PAYMENT_STEP2_V1
//
// - Les deux interrupteurs (carte bancaire / virement) s'enregistrent IMMÉDIATEMENT : en cas d'incident
//   Stripe, il faut pouvoir couper la carte en un clic, sans dépendre de la validation des champs bancaires.
// - Les coordonnées bancaires et le délai s'enregistrent avec le bouton « Enregistrer ».
// - Le virement ne peut être activé que si le bénéficiaire et un IBAN valide sont déjà enregistrés.
// - Les réglages ne concernent que les PROCHAINES commandes.
// - Le délai est une date limite INDICATIVE : aucune annulation automatique des virements.
// - payment_methods est lisible par le public ; bank_transfer est réservé aux administrateurs.
// ============================================================

const TIME_ZONE = "Europe/Paris";

function formatDateTime(value) {
  if (!value) return null;
  return new Date(value).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: TIME_ZONE });
}

function friendlyError(err) {
  const msg = (err && err.message) || String(err || "");
  if (/site_settings_payment_methods_valid|site_settings_bank_transfer_valid|violates check constraint/i.test(msg)) {
    return "La base refuse cette valeur. Vérifiez que le script SQL de la phase 1 (paiement par virement) a bien été exécuté dans Supabase.";
  }
  if (/row-level security|permission denied|not authorized|unauthorized/i.test(msg)) {
    return "Enregistrement refusé : ce compte n'a pas les droits d'administration.";
  }
  return msg;
}

function Switch({ checked, onChange, disabled, label, testid }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      disabled={disabled}
      data-testid={testid}
      className={"relative h-7 w-12 rounded-full transition-colors disabled:opacity-50 shrink-0 " + (checked ? "bg-emerald-600" : "bg-[#d9cfd3]")}
    >
      <span className={"absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow transition-transform " + (checked ? "translate-x-5" : "")} />
    </button>
  );
}

export default function AdminPaymentMethods() {
  const [methodsRow, setMethodsRow] = useState(null);
  const [bankRow, setBankRow] = useState(null);
  const [draft, setDraft] = useState({ ...DEFAULT_BANK_TRANSFER });
  const [pendingTransfers, setPendingTransfers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const load = useCallback(async (resetDraft) => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await supabase
        .from(SITE_SETTINGS_TABLE)
        .select("*")
        .in("key", [PAYMENT_METHODS_KEY, BANK_TRANSFER_KEY]);
      if (res.error) {
        setLoadError(friendlyError(res.error));
      } else {
        const list = res.data || [];
        const m = list.find((r) => r.key === PAYMENT_METHODS_KEY) || null;
        const b = list.find((r) => r.key === BANK_TRANSFER_KEY) || null;
        setMethodsRow(m);
        setBankRow(b);
        if (resetDraft) {
          const parsed = parseBankTransfer(b ? b.value : null);
          setDraft({ ...parsed, iban: formatIban(parsed.iban) });
        }
      }
    } catch (err) {
      setLoadError(friendlyError(err));
    }
    // Nombre de commandes en attente de virement (sert à l'avertissement « changement d'IBAN »).
    // Non bloquant : si la lecture échoue, on n'affiche simplement pas l'avertissement.
    try {
      const cnt = await supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "pending_transfer");
      setPendingTransfers(!cnt.error && typeof cnt.count === "number" ? cnt.count : 0);
    } catch (err) {
      setPendingTransfers(0);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load(true);
  }, [load]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const savedMethods = parsePaymentMethods(methodsRow ? methodsRow.value : null);
  const savedBank = parseBankTransfer(bankRow ? bankRow.value : null);
  const dirty = !sameBankTransfer(draft, savedBank);
  const disabled = loading || Boolean(loadError) || busy;

  const ibanFilled = String(draft.iban || "").trim() !== "";
  const bicFilled = String(draft.bic || "").trim() !== "";
  const ibanInvalid = ibanFilled && !isValidIban(draft.iban);
  const bicInvalid = bicFilled && !isValidBic(draft.bic);
  const delayInvalid = !isValidDelay(draft.delay_days);
  const ibanChanged = normalizeIban(draft.iban) !== savedBank.iban;

  const noneActive = !loading && !loadError && !savedMethods.stripe_enabled && !savedMethods.transfer_enabled;
  const transferNeedsData = savedMethods.transfer_enabled && !isTransferReady(savedBank);
  const missing = bankMissingFields(savedBank);

  const setField = (key, value) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setError("");
  };

  // Interrupteurs : enregistrement immédiat de la clé publique payment_methods
  const setMethod = async (field, next) => {
    if (disabled) return;
    setError("");
    if (field === "transfer_enabled" && next && !isTransferReady(savedBank)) {
      setError("Pour activer le virement, renseignez puis enregistrez d'abord le bénéficiaire et un IBAN valide.");
      return;
    }
    setBusy(true);
    try {
      const value = {
        stripe_enabled: field === "stripe_enabled" ? next : savedMethods.stripe_enabled,
        transfer_enabled: field === "transfer_enabled" ? next : savedMethods.transfer_enabled,
      };
      const { error: err } = await supabase
        .from(SITE_SETTINGS_TABLE)
        .upsert({ key: PAYMENT_METHODS_KEY, value }, { onConflict: "key" });
      if (err) throw err;
      setToast(
        field === "stripe_enabled"
          ? (next ? "Carte bancaire réactivée." : "Carte bancaire désactivée pour les prochaines commandes.")
          : (next ? "Virement bancaire activé." : "Virement bancaire désactivé pour les prochaines commandes.")
      );
      await load(false);
    } catch (err) {
      setError("Échec de l'enregistrement : " + friendlyError(err));
    }
    setBusy(false);
  };

  // Coordonnées bancaires et délai : bouton « Enregistrer »
  const save = async () => {
    if (ibanInvalid) {
      setError("Cet IBAN n'est pas valide (format ou clé de contrôle). Vérifiez-le avant d'enregistrer.");
      return;
    }
    if (bicInvalid) {
      setError("Ce BIC n'est pas valide (8 ou 11 caractères).");
      return;
    }
    if (delayInvalid) {
      setError("Le délai de paiement doit être un nombre entier de jours, entre " + DELAY_MIN + " et " + DELAY_MAX + ".");
      return;
    }
    if (savedMethods.transfer_enabled && !isTransferReady(draft)) {
      setError("Le virement est activé : désactivez-le d'abord avant de vider le bénéficiaire ou l'IBAN.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const { error: err } = await supabase
        .from(SITE_SETTINGS_TABLE)
        .upsert({ key: BANK_TRANSFER_KEY, value: buildBankTransferValue(draft) }, { onConflict: "key" });
      if (err) throw err;
      setToast("Coordonnées bancaires enregistrées. Elles s'appliquent aux prochaines commandes.");
      await load(true);
    } catch (err) {
      setError("Échec de l'enregistrement : " + friendlyError(err));
    }
    setBusy(false);
  };

  const cancel = () => {
    setDraft({ ...savedBank, iban: formatIban(savedBank.iban) });
    setError("");
  };

  const times = [methodsRow && methodsRow.updated_at, bankRow && bankRow.updated_at].filter(Boolean).sort();
  const lastRow = times.length && bankRow && bankRow.updated_at === times[times.length - 1] ? bankRow : methodsRow;
  const savedAt = times.length ? formatDateTime(times[times.length - 1]) : null;

  const inputCls = "mt-1 w-full rounded-xl border border-[#eadfe4] focus:border-[#8f6075] px-3 h-10 text-sm outline-none bg-white disabled:opacity-60";

  return (
    <section data-testid="payment-methods-panel" className="rounded-2xl bg-white border border-[#eee2e5] p-5 mb-6">
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0">
          <h2 className="font-serif text-xl flex items-center gap-2">
            <CreditCard size={18} className="text-[#8f6075]" /> Moyens de paiement
          </h2>
          <p className="text-xs text-[#8b737e] mt-1 leading-4">Réglages appliqués aux prochaines commandes uniquement.</p>
        </div>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={loading || busy}
          aria-label="Actualiser les moyens de paiement"
          className="shrink-0 h-9 w-9 grid place-items-center rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] disabled:opacity-60"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {noneActive && (
        <div role="alert" data-testid="payment-none-active" className="mt-4 rounded-xl border border-[#e9c4c4] bg-[#fdf4f4] px-4 py-3">
          <div className="text-sm font-medium text-[#b23b3b] flex items-center gap-2">
            <AlertTriangle size={15} /> Aucun moyen de paiement actif
          </div>
          <div className="text-xs text-[#8b737e] mt-1 leading-5">
            Les clientes ne pourront plus finaliser aucune commande tant qu&apos;un moyen de paiement n&apos;est pas réactivé.
          </div>
        </div>
      )}

      <div className="mt-4 rounded-xl border border-[#eadfe4] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-[#412f3b]">Carte bancaire (Stripe)</div>
            <div className="text-[11px] text-[#8b737e]">Désactivez en cas d&apos;incident Stripe : les clientes ne verront plus que le virement.</div>
          </div>
          <Switch
            checked={savedMethods.stripe_enabled}
            onChange={() => setMethod("stripe_enabled", !savedMethods.stripe_enabled)}
            disabled={disabled}
            label="Carte bancaire (Stripe)"
            testid="payment-stripe-switch"
          />
        </div>
        <div className="text-[11px] text-[#8b737e] mt-2">
          Statut actuel :{" "}
          <b className={savedMethods.stripe_enabled ? "text-emerald-700" : "text-[#b23b3b]"}>
            {savedMethods.stripe_enabled ? "actif" : "désactivé"}
          </b>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-[#eadfe4] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-[#412f3b]">Virement bancaire</div>
            <div className="text-[11px] text-[#8b737e]">Activer ce moyen de paiement sur le site (bénéficiaire et IBAN valide requis).</div>
          </div>
          <Switch
            checked={savedMethods.transfer_enabled}
            onChange={() => setMethod("transfer_enabled", !savedMethods.transfer_enabled)}
            disabled={disabled}
            label="Virement bancaire"
            testid="payment-transfer-switch"
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <div className="sm:col-span-2">
            <label className="text-xs text-[#54434c] font-medium" htmlFor="bt_beneficiary">Bénéficiaire</label>
            <input
              id="bt_beneficiary"
              type="text"
              maxLength={120}
              value={draft.beneficiary}
              disabled={disabled}
              onChange={(e) => setField("beneficiary", e.target.value)}
              placeholder="À compléter"
              className={inputCls}
            />
          </div>
          <div>
            <label className="text-xs text-[#54434c] font-medium" htmlFor="bt_iban">IBAN</label>
            <input
              id="bt_iban"
              type="text"
              maxLength={42}
              value={draft.iban}
              disabled={disabled}
              onChange={(e) => setField("iban", e.target.value)}
              placeholder="À compléter"
              aria-invalid={ibanInvalid}
              className={inputCls + (ibanInvalid ? " border-red-300" : "")}
            />
            {ibanInvalid && <div className="text-[11px] text-red-600 mt-1">IBAN non valide (format ou clé de contrôle).</div>}
          </div>
          <div>
            <label className="text-xs text-[#54434c] font-medium" htmlFor="bt_bic">BIC</label>
            <input
              id="bt_bic"
              type="text"
              maxLength={16}
              value={draft.bic}
              disabled={disabled}
              onChange={(e) => setField("bic", e.target.value)}
              placeholder="À compléter"
              aria-invalid={bicInvalid}
              className={inputCls + (bicInvalid ? " border-red-300" : "")}
            />
            {bicInvalid && <div className="text-[11px] text-red-600 mt-1">BIC non valide (8 ou 11 caractères).</div>}
          </div>
          <div>
            <label className="text-xs text-[#54434c] font-medium" htmlFor="bt_delay">Délai de paiement (jours)</label>
            <input
              id="bt_delay"
              type="number"
              min={DELAY_MIN}
              max={DELAY_MAX}
              step={1}
              value={draft.delay_days}
              disabled={disabled}
              onChange={(e) => setField("delay_days", e.target.value)}
              aria-invalid={delayInvalid}
              className={inputCls + (delayInvalid ? " border-red-300" : "")}
            />
            {delayInvalid && <div className="text-[11px] text-red-600 mt-1">Entier entre {DELAY_MIN} et {DELAY_MAX}.</div>}
          </div>
        </div>
        <div className="text-[11px] text-[#8b737e] mt-3 leading-4">
          Date limite de paiement <b>indicative</b> : aucune annulation automatique. Elle est affichée à la cliente et vous sert de repère de relance.
          La prolongation d&apos;une commande reprend par défaut ce délai (modifiable de {DELAY_MIN} à {DELAY_MAX} jours). Les espaces de l&apos;IBAN sont ignorés.
        </div>

        {ibanChanged && pendingTransfers > 0 && (
          <div data-testid="payment-iban-pending-warning" className="mt-3 rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-xs leading-5">
            {pendingTransfers} commande(s) en attente de virement afficheront ce nouvel IBAN dès l&apos;enregistrement. Prévenez les clientes concernées si un virement est déjà parti.
          </div>
        )}
        {transferNeedsData && (
          <div className="mt-3 rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-xs leading-5">
            Le virement est activé mais les coordonnées enregistrées sont incomplètes ({missing.join(", ")}).
          </div>
        )}
        {!savedMethods.transfer_enabled && !isTransferReady(savedBank) && (
          <div className="mt-3 rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-xs leading-5">
            À compléter avant d&apos;activer le virement : bénéficiaire et IBAN valide (le BIC est recommandé).
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 mt-4">
          <button
            type="button"
            onClick={save}
            disabled={disabled || !dirty || ibanInvalid || bicInvalid || delayInvalid}
            data-testid="payment-save"
            className="rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-6 h-10 text-sm disabled:opacity-50 disabled:hover:bg-[#8f6075]"
          >
            {busy ? "Enregistrement..." : "Enregistrer"}
          </button>
          {dirty && !disabled && (
            <button type="button" onClick={cancel} className="rounded-full border border-[#d9c5cc] px-5 h-10 text-sm hover:bg-[#f5edf1]">
              Annuler
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-[#eadfe4] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-[#412f3b]">Chèque</div>
            <div className="text-[11px] text-[#8b737e]">Non encore disponible — prochaine étape.</div>
          </div>
          <Switch checked={false} onChange={() => {}} disabled={true} label="Chèque (non disponible)" testid="payment-cheque-switch" />
        </div>
      </div>

      {toast && <div data-testid="payment-toast" className="mt-4 rounded-xl bg-emerald-50 text-emerald-700 px-4 py-3 text-sm">{toast}</div>}
      {loadError && <div role="alert" className="mt-4 rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm">{loadError}</div>}
      {error && <div role="alert" className="mt-4 rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm">{error}</div>}

      {!loadError && !loading && (
        <p className="text-[11px] text-[#8b737e] leading-4 mt-4">
          {savedAt ? "Modifié le " + savedAt + (lastRow && lastRow.updated_by_email ? " · " + lastRow.updated_by_email : "") : "Rien d'enregistré (carte active, virement désactivé par défaut)"}
        </p>
      )}
    </section>
  );
}
