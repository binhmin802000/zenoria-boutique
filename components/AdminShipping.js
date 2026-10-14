import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Truck, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { SITE_SETTINGS_TABLE } from "@/lib/siteSettings";
import {
  SHIPPING_KEY,
  SHIPPING_MIN,
  DEFAULT_SHIPPING,
  parseShippingSetting,
  buildShippingValue,
  sameShippingSetting,
  parseThresholdInput,
  qualifiesForFreeShipping,
  shippingStripText,
  describeShipping,
} from "@/lib/shippingSettings";

// ============================================================
// CARTE « LIVRAISON OFFERTE » (onglet « Contenu du site » de /admin)
//
// Deux réglages, enregistrés dans la table « site_settings » (clé « shipping ») :
//  - l'interrupteur « Livraison offerte » : activée ou désactivée
//  - le montant, en euros (entier de 1 à 1 000), à partir duquel la livraison est offerte
//
// Le bandeau du haut de page (accueil et quiz), la barre de progression du panier et le calcul de la livraison lisent
// ce même réglage : ils ne peuvent jamais afficher deux montants différents. Les codes promo restent indépendants.
// Tant que rien n'est enregistré, le site utilise la valeur par défaut (activée, 75 €). Voir supabase_shipping.sql.
// ============================================================

const TIME_ZONE = "Europe/Paris";

function formatDateTime(value) {
  if (!value) return null;
  return new Date(value).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: TIME_ZONE });
}

function friendlyError(err) {
  const msg = (err && err.message) || String(err || "");
  if (/site_settings_shipping_valid|violates check constraint/i.test(msg)) {
    return "La valeur est refusée par la base. Exécutez le script supabase_shipping.sql dans Supabase (SQL Editor), puis réessayez.";
  }
  if (/relation|does not exist|schema cache|could not find the table/i.test(msg)) {
    return "La table des réglages n'est pas installée. Exécutez le script supabase_shipping.sql dans Supabase (SQL Editor).";
  }
  if (/row-level security|permission denied|not authorized|unauthorized/i.test(msg)) {
    return "Enregistrement refusé : ce compte n'a pas les droits d'administration.";
  }
  return msg;
}

export default function AdminShipping() {
  const [row, setRow] = useState(null); // ligne enregistrée (ou null : rien d'enregistré, donc valeur par défaut)
  const [enabled, setEnabled] = useState(DEFAULT_SHIPPING.enabled);
  const [text, setText] = useState(String(DEFAULT_SHIPPING.threshold));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await supabase.from(SITE_SETTINGS_TABLE).select("*").eq("key", SHIPPING_KEY).maybeSingle();
      if (res.error) {
        setLoadError(friendlyError(res.error));
      } else {
        const saved = res.data || null;
        setRow(saved);
        const parsed = parseShippingSetting(saved ? saved.value : null);
        setEnabled(parsed.enabled);
        setText(String(parsed.threshold));
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

  const saved = useMemo(() => parseShippingSetting(row ? row.value : null), [row]);
  const input = useMemo(() => parseThresholdInput(text), [text]);
  const draft = input.ok ? { enabled, threshold: input.value } : null;
  const dirty = draft !== null && (!row || !sameShippingSetting(draft, saved));
  const disabled = loading || Boolean(loadError) || saving;
  const shown = draft || { enabled, threshold: saved.threshold }; // aperçu : si la saisie est invalide, on garde le dernier montant valide

  const save = async () => {
    setError("");
    if (!draft) {
      setError(input.error);
      return;
    }
    setSaving(true);
    try {
      const { error: err } = await supabase.from(SITE_SETTINGS_TABLE).upsert({ key: SHIPPING_KEY, value: buildShippingValue(draft) }, { onConflict: "key" });
      if (err) throw err;
      setToast("Réglage enregistré. Les visiteurs le voient au prochain chargement de la page.");
      await load();
    } catch (err) {
      setError("Échec de l'enregistrement : " + friendlyError(err));
    }
    setSaving(false);
  };

  const t = shown.threshold;
  const examples = shown.enabled
    ? [
        { amount: t - 1, free: qualifiesForFreeShipping(shown, t - 1) },
        { amount: t, free: qualifiesForFreeShipping(shown, t) },
      ].filter((e) => e.amount >= SHIPPING_MIN)
    : [];
  const savedAt = row ? formatDateTime(row.updated_at) : null;

  return (
    <section data-testid="shipping-panel" className="mt-8 rounded-2xl bg-white border border-[#eee2e5] p-5">
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0">
          <h2 className="font-serif text-xl flex items-center gap-2">
            <Truck size={18} className="text-[#8f6075]" /> Livraison offerte
          </h2>
          <p className="text-xs text-[#8b737e] mt-1 leading-4">
            Le montant à partir duquel la livraison est offerte, et un interrupteur pour l&apos;activer ou la désactiver. Le réglage s&apos;applique au bandeau du haut de page, à la barre de progression du panier et au calcul de la livraison.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          aria-label="Actualiser le réglage de la livraison"
          className="shrink-0 h-9 w-9 grid place-items-center rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] disabled:opacity-60"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {toast && <div data-testid="shipping-toast" className="mt-4 rounded-xl bg-emerald-50 text-emerald-700 px-4 py-3 text-sm">{toast}</div>}
      {loadError && <div data-testid="shipping-load-error" role="alert" className="mt-4 rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm">{loadError}</div>}
      {error && <div data-testid="shipping-error" role="alert" className="mt-4 rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm">{error}</div>}

      <div className="mt-5 flex items-center justify-between gap-4 rounded-xl border border-[#eee2e5] px-4 py-3">
        <div className="min-w-0">
          <div className="text-sm font-medium" id="shipping-switch-label">Livraison offerte</div>
          <div className="text-[12px] text-[#756a70] leading-5">
            {enabled
              ? "Activée : la livraison est offerte dès que le panier atteint le montant ci-dessous."
              : "Désactivée : la livraison est facturée quel que soit le montant du panier, et le message « Livraison offerte » disparaît du site."}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-labelledby="shipping-switch-label"
          disabled={disabled}
          onClick={() => {
            setEnabled(!enabled);
            setError("");
          }}
          data-testid="shipping-switch"
          className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-60 ${enabled ? "bg-[#8f6075]" : "bg-[#d9c5cc]"}`}
        >
          <span className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5" : ""}`} />
        </button>
      </div>

      <label className="block mt-4 text-sm">
        <span className="block text-xs text-[#8b737e]">Montant à partir duquel la livraison est offerte</span>
        <span className="mt-1 flex items-center gap-2">
          <input
            type="text"
            inputMode="numeric"
            value={text}
            disabled={disabled}
            onChange={(e) => {
              setText(e.target.value);
              setError("");
            }}
            aria-invalid={!input.ok}
            aria-describedby="shipping-amount-help"
            data-testid="shipping-amount"
            className="w-32 rounded-xl border border-[#eadfe4] px-3 h-10 outline-none focus:border-[#8f6075] bg-white disabled:opacity-60"
          />
          <span className="text-sm text-[#54434c]">€</span>
        </span>
        <span id="shipping-amount-help" className={`block text-[11px] mt-1 leading-4 ${input.ok ? "text-[#8b737e]" : "text-red-600"}`} data-testid="shipping-amount-help">
          {input.ok
            ? "Nombre entier d'euros, de 1 à 1 000. Comparé au panier après remise : le montant exact est atteint, la livraison est offerte."
            : input.error}
        </span>
        {!enabled && <span className="block text-[11px] text-[#8b737e] mt-1 leading-4">Livraison désactivée : ce montant est conservé et reprendra effet à la réactivation.</span>}
      </label>

      <div className="mt-5 rounded-xl bg-[#faf6f8] border border-[#eee2e5] px-4 py-3">
        <div className="text-xs text-[#8b737e] mb-1.5">Aperçu du bandeau</div>
        <div data-testid="shipping-preview" className="rounded-lg bg-[#342434] text-white/85 text-[11px] py-2 px-3 text-center tracking-wide">
          {shippingStripText(shown)}
        </div>
        <ul className="mt-3 space-y-1 text-[12px] text-[#6b5a63] leading-5" data-testid="shipping-examples">
          {shown.enabled ? (
            examples.map((e) => (
              <li key={e.amount}>
                Panier de <strong className="font-medium">{e.amount} €</strong> (après remise) : livraison {e.free ? "offerte" : "facturée"}.
              </li>
            ))
          ) : (
            <li>Tous les paniers paient la livraison.</li>
          )}
          <li>
            Un code promo « Livraison offerte » (comme LIVRAISONZEN) met toujours la livraison à 0 €, que l&apos;interrupteur soit activé ou non. Les codes promo se gèrent séparément.
          </li>
        </ul>
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-5">
        <button
          type="button"
          onClick={save}
          disabled={disabled || !dirty}
          data-testid="shipping-save"
          className="rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-6 h-10 text-sm disabled:opacity-50 disabled:hover:bg-[#8f6075]"
        >
          {saving ? "Enregistrement..." : "Enregistrer"}
        </button>
        {!loadError && !loading && (
          <p data-testid="shipping-saved-text" className="text-[11px] text-[#54434c] leading-4">
            Réglage actuel : <strong className="font-medium">{describeShipping(saved)}</strong>
            {savedAt && (
              <span className="text-[#8b737e]">
                {" "}
                · modifié le {savedAt}
                {row && row.updated_by_email ? ` · ${row.updated_by_email}` : ""}
              </span>
            )}
            {!row && <span className="text-[#8b737e]"> · rien d&apos;enregistré : valeur par défaut</span>}
          </p>
        )}
      </div>

      <p className="text-[11px] text-[#8b737e] mt-3 leading-4">
        Les frais de livraison sous le seuil restent réglés dans le code du site. Tant que le paiement en ligne n&apos;est pas actif, le calcul se fait dans la page ; à l&apos;ouverture du paiement, il devra être refait côté serveur avec ce même réglage.
      </p>
    </section>
  );
}
