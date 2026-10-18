// ZENORIA_ADMIN_CONTACT_V1
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Mail, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { SITE_SETTINGS_TABLE } from "@/lib/siteSettings";
import {
  CONTACT_KEY,
  DEFAULT_CONTACT,
  parseContactSetting,
  buildContactValue,
  sameContactSetting,
  describeContact,
} from "@/lib/contactSettings";

// ============================================================
// CARTE « CANAUX DE CONTACT » (onglet « Contenu du site » de /admin)
//
// Trois canaux independants, enregistres dans la table « site_settings »
// (cle « contact ») : e-mail, WhatsApp, Signal. Chacun a son propre
// interrupteur (affiche ou masque sur le site) et sa propre valeur
// (adresse e-mail ou numero de telephone).
//
// Le footer du site (pages/index.js) lit ce meme reglage : aucun canal
// ne peut etre affiche sur le site sans etre a la fois active ET
// renseigne ici.
// ============================================================

const TIME_ZONE = "Europe/Paris";

function formatDateTime(value) {
  if (!value) return null;
  return new Date(value).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: TIME_ZONE });
}

function friendlyError(err) {
  const msg = (err && err.message) || String(err || "");
  if (/site_settings_contact_valid|violates check constraint/i.test(msg)) {
    return "La valeur est refusée par la base. Exécutez le script supabase_site_settings_contact.sql dans Supabase (SQL Editor), puis réessayez.";
  }
  if (/relation|does not exist|schema cache|could not find the table/i.test(msg)) {
    return "La table des réglages n'est pas installée. Exécutez le script supabase_site_settings_contact.sql dans Supabase (SQL Editor).";
  }
  if (/row-level security|permission denied|not authorized|unauthorized/i.test(msg)) {
    return "Enregistrement refusé : ce compte n'a pas les droits d'administration.";
  }
  return msg;
}

const CHANNEL_META = {
  email: { label: "E-mail", placeholder: "contact@zenoria.fr", helper: "Adresse e-mail affichée dans le pied de page du site." },
  whatsapp: { label: "WhatsApp", placeholder: "+33612345678", helper: "Numéro au format international (ex. +33612345678), jamais affiché en clair : seul un bouton « WhatsApp » apparaît sur le site." },
  signal: { label: "Signal", placeholder: "+33612345678", helper: "Numéro au format international (ex. +33612345678), jamais affiché en clair : seul un bouton « Signal » apparaît sur le site." },
};

export default function AdminContact() {
  const [row, setRow] = useState(null);
  const [draftState, setDraftState] = useState(DEFAULT_CONTACT);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await supabase.from(SITE_SETTINGS_TABLE).select("*").eq("key", CONTACT_KEY).maybeSingle();
      if (res.error) {
        setLoadError(friendlyError(res.error));
      } else {
        const saved = res.data || null;
        setRow(saved);
        setDraftState(parseContactSetting(saved ? saved.value : null));
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

  const saved = useMemo(() => parseContactSetting(row ? row.value : null), [row]);
  const dirty = !sameContactSetting(draftState, saved);
  const disabled = loading || Boolean(loadError) || saving;
  const savedAt = row ? formatDateTime(row.updated_at) : null;

  const setChannel = (channel, patch) => {
    setDraftState((prev) => ({ ...prev, [channel]: { ...prev[channel], ...patch } }));
    setError("");
  };

  const save = async () => {
    setError("");
    setSaving(true);
    try {
      const { error: err } = await supabase
        .from(SITE_SETTINGS_TABLE)
        .upsert({ key: CONTACT_KEY, value: buildContactValue(draftState) }, { onConflict: "key" });
      if (err) throw err;
      setToast("Réglage enregistré. Les visiteuses le voient au prochain chargement de la page.");
      await load();
    } catch (err) {
      setError("Échec de l'enregistrement : " + friendlyError(err));
    }
    setSaving(false);
  };

  return (
    <section data-testid="contact-panel" className="mt-8 rounded-2xl bg-white border border-[#eee2e5] p-5">
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0">
          <h2 className="font-serif text-xl flex items-center gap-2">
            <Mail size={18} className="text-[#8f6075]" /> Canaux de contact
          </h2>
          <p className="text-xs text-[#8b737e] mt-1 leading-4">
            Activez ou désactivez l&apos;e-mail, WhatsApp et Signal affichés dans le pied de page du site, et renseignez l&apos;adresse ou le numéro associé à chacun.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          aria-label="Actualiser les réglages de contact"
          className="shrink-0 h-9 w-9 grid place-items-center rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] disabled:opacity-60"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {toast && <div data-testid="contact-toast" className="mt-4 rounded-xl bg-emerald-50 text-emerald-700 px-4 py-3 text-sm">{toast}</div>}
      {loadError && <div data-testid="contact-load-error" role="alert" className="mt-4 rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm">{loadError}</div>}
      {error && <div data-testid="contact-error" role="alert" className="mt-4 rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm">{error}</div>}

      <div className="mt-5 space-y-4">
        {Object.keys(CHANNEL_META).map((channel) => {
          const meta = CHANNEL_META[channel];
          const ch = draftState[channel];
          return (
            <div key={channel} className="rounded-xl border border-[#eee2e5] px-4 py-3.5">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-medium" id={`contact-switch-label-${channel}`}>{meta.label}</div>
                  <div className="text-[12px] text-[#756a70] leading-5">{meta.helper}</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={ch.enabled}
                  aria-labelledby={`contact-switch-label-${channel}`}
                  disabled={disabled}
                  onClick={() => setChannel(channel, { enabled: !ch.enabled })}
                  data-testid={`contact-switch-${channel}`}
                  className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-60 ${ch.enabled ? "bg-[#8f6075]" : "bg-[#d9c5cc]"}`}
                >
                  <span className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${ch.enabled ? "translate-x-5" : ""}`} />
                </button>
              </div>
              <label className="block mt-3 text-sm">
                <span className="block text-xs text-[#8b737e]">{channel === "email" ? "Adresse e-mail" : "Numéro de téléphone"}</span>
                <input
                  type="text"
                  value={ch.value}
                  disabled={disabled}
                  placeholder={meta.placeholder}
                  onChange={(e) => setChannel(channel, { value: e.target.value })}
                  data-testid={`contact-value-${channel}`}
                  className="mt-1 w-full max-w-sm rounded-xl border border-[#eadfe4] px-3 h-10 outline-none focus:border-[#8f6075] bg-white disabled:opacity-60"
                />
              </label>
              {ch.enabled && !ch.value.trim() && (
                <p className="text-[11px] text-amber-700 mt-1.5 leading-4">
                  Ce canal est activé mais aucune valeur n&apos;est renseignée : il ne s&apos;affichera pas sur le site tant que ce champ est vide.
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-5">
        <button
          type="button"
          onClick={save}
          disabled={disabled || !dirty}
          data-testid="contact-save"
          className="rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-6 h-10 text-sm disabled:opacity-50 disabled:hover:bg-[#8f6075]"
        >
          {saving ? "Enregistrement..." : "Enregistrer"}
        </button>
        {!loadError && !loading && (
          <p data-testid="contact-saved-text" className="text-[11px] text-[#54434c] leading-4">
            Réglage actuel : <strong className="font-medium">{describeContact(saved)}</strong>
            {savedAt && (
              <span className="text-[#8b737e]">
                {" "}
                — modifié le {savedAt}
                {row && row.updated_by_email ? ` par ${row.updated_by_email}` : ""}
              </span>
            )}
            {!row && <span className="text-[#8b737e]"> — rien d&apos;enregistré : valeur par défaut</span>}
          </p>
        )}
      </div>

      <p className="text-[11px] text-[#8b737e] mt-3 leading-4">
        Le numéro utilisé pour WhatsApp et Signal n&apos;est jamais affiché en clair sur le site : seul un bouton portant le nom du canal est visible, qui ouvre directement une conversation.
      </p>
    </section>
  );
}
