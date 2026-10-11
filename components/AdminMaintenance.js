import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw, Copy, ExternalLink } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatReturnAt } from "@/lib/maintenance";

// ============================================================
// ONGLET « MAINTENANCE » de l'administration (/admin)
//
// Deux modes, plus « ouvert » :
//  - BOUTIQUE EN PAUSE : le catalogue reste visible, la commande est fermée, une bannière explique.
//  - MAINTENANCE TOTALE : les visiteurs reçoivent une page de maintenance avec le vrai code 503 et
//    l'en-tête Retry-After (voir middleware.js). /admin reste accessible, et un lien d'aperçu secret
//    permet de voir le site pendant la coupure.
//
// L'état est enregistré dans Supabase (voir supabase_maintenance.sql). Les dates et auteurs, le lien
// d'aperçu et l'historique sont remplis par la base elle-même, jamais par le navigateur.
// Un changement est pris en compte par les visiteurs en 10 à 15 secondes.
// ============================================================

const TABLE = "site_maintenance";
const LOG_TABLE = "site_maintenance_log";
const TIME_ZONE = "Europe/Paris";

const MODES = [
  { id: "off", label: "Ouvert", description: "Le site fonctionne normalement." },
  {
    id: "shop_pause",
    label: "Boutique en pause",
    description:
      "Le catalogue reste visible. Le bouton « Commander » est désactivé et une bannière explique la situation. Pour un inventaire, des congés ou une rupture générale.",
  },
  {
    id: "full",
    label: "Maintenance totale",
    description:
      "Les visiteurs voient une page de maintenance (code 503 avec Retry-After, ce que Google attend). /admin reste accessible. À réserver aux interventions techniques courtes, de moins de 24 h.",
  },
];

const PRESETS = [
  "Inventaire en cours : la boutique reprend très bientôt.",
  "Mise à jour technique en cours : nous revenons dans un instant.",
  "Nous sommes en congés : les commandes reprennent à notre retour.",
];

function formatDateTime(value) {
  if (!value) return null;
  return new Date(value).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: TIME_ZONE });
}

function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes());
}

function fromLocalInput(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Une coupure est « active » tant que le mode n'est pas « off » et que la fin programmée n'est pas passée.
export function isMaintenanceActive(row, nowMs) {
  if (!row || !row.mode || row.mode === "off") return false;
  if (!row.auto_end_at) return true;
  return Date.parse(row.auto_end_at) > (typeof nowMs === "number" ? nowMs : Date.now());
}

function friendlyError(err) {
  const msg = (err && err.message) || String(err || "");
  if (/relation|does not exist|schema cache|could not find the table/i.test(msg)) {
    return "La maintenance n'est pas installée. Exécutez le script supabase_maintenance.sql dans Supabase (SQL Editor).";
  }
  return msg;
}

function useTick(ms) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

// ------------------------------------------------------------
// Chargement (utilisé par le bandeau ET par l'onglet)
// ------------------------------------------------------------
export function useMaintenanceStatus(enabled) {
  const [state, setState] = useState({ loading: true, error: "", row: null, log: [] });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: "" }));
    const [m, l] = await Promise.all([
      supabase.from(TABLE).select("*").maybeSingle(),
      supabase.from(LOG_TABLE).select("*").order("at", { ascending: false }).limit(10),
    ]);
    const err = m.error || l.error;
    setState({ loading: false, error: err ? friendlyError(err) : "", row: m.data || null, log: l.data || [] });
  }, []);

  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);

  const save = useCallback(
    async (payload) => {
      // UPDATE (et non « upsert ») : la ligne unique existe déjà, et le déclencheur de la base ne doit
      // s'exécuter qu'une fois par enregistrement.
      const { data, error } = await supabase.from(TABLE).update(payload).eq("id", true).select();
      if (error) return { error };
      if (!data || data.length === 0) {
        return { error: { message: "Aucune ligne mise à jour (ligne absente ou droits insuffisants). Relancez le script supabase_maintenance.sql." } };
      }
      await load();
      return { error: null };
    },
    [load]
  );

  return { ...state, reload: load, save };
}

// ------------------------------------------------------------
// Bandeau affiché en haut des autres onglets tant qu'une coupure est active
// ------------------------------------------------------------
export function MaintenanceBanner({ status, onOpen }) {
  useTick(30000);
  const row = status && status.row;
  if (!row || !isMaintenanceActive(row, Date.now())) return null;
  const full = row.mode === "full";
  return (
    <div
      role="alert"
      data-testid="maintenance-banner"
      data-mode={row.mode}
      className={`mb-5 rounded-xl px-4 py-3 text-sm flex flex-wrap items-center gap-x-4 gap-y-2 ${
        full ? "bg-red-600 text-white" : "bg-amber-50 text-amber-900 border border-amber-200"
      }`}
    >
      <div className="flex-1 min-w-[240px]">
        <strong>{full ? "Maintenance totale active" : "Boutique en pause"}</strong>
        {full ? " : les visiteurs voient une page de maintenance (code 503). " : " : le catalogue reste visible, les commandes sont fermées. "}
        {row.auto_end_at ? "Réouverture automatique : " + formatReturnAt(row.auto_end_at) + "." : "Réouverture manuelle."}
      </div>
      <button type="button" onClick={onOpen} className="underline font-medium">
        Gérer
      </button>
    </div>
  );
}

// ------------------------------------------------------------
// L'onglet
// ------------------------------------------------------------
export default function AdminMaintenance({ status }) {
  const { loading, error, row, log, reload, save } = status;
  useTick(30000);

  const [mode, setMode] = useState("off");
  const [message, setMessage] = useState("");
  const [returnLocal, setReturnLocal] = useState("");
  const [autoReopen, setAutoReopen] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [toast, setToast] = useState("");
  const [copied, setCopied] = useState(false);

  const now = Date.now();
  const active = isMaintenanceActive(row, now);
  const expired = Boolean(row && row.mode && row.mode !== "off" && !active);

  // Le formulaire reprend l'état enregistré (à chaque nouvel enregistrement)
  useEffect(() => {
    if (!row) return;
    const act = isMaintenanceActive(row, Date.now());
    setMode(act ? row.mode : "off");
    setMessage(act ? row.message || "" : "");
    setReturnLocal(act ? toLocalInput(row.return_at) : "");
    setAutoReopen(act ? Boolean(row.auto_end_at) : true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row && row.updated_at]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const previewUrl =
    active && row.mode === "full" && row.preview_token && typeof window !== "undefined"
      ? window.location.origin + "/?preview=" + row.preview_token
      : "";

  const activeSince = active && row.activated_at ? Date.parse(row.activated_at) : NaN;
  const tooLong = row && row.mode === "full" && Number.isFinite(activeSince) && now - activeSince > 24 * 3600 * 1000;

  const onSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    const returnIso = fromLocalInput(returnLocal);

    let payload;
    if (mode === "off") {
      payload = { mode: "off", message: "", return_at: null, auto_end_at: null };
    } else {
      if (message.trim().length > 500) {
        setFormError("Le message est limité à 500 caractères.");
        return;
      }
      if (returnLocal && !returnIso) {
        setFormError("L'heure de retour n'est pas valide.");
        return;
      }
      if (returnIso && Date.parse(returnIso) <= Date.now()) {
        setFormError("L'heure de retour doit être dans le futur.");
        return;
      }
      if (autoReopen && !returnIso) {
        setFormError("Indiquez l'heure de retour pour la réouverture automatique, ou décochez-la pour rouvrir à la main.");
        return;
      }
      payload = { mode, message: message.trim(), return_at: returnIso, auto_end_at: autoReopen ? returnIso : null };
    }

    if (mode === "full" && !(active && row.mode === "full")) {
      const okConfirm = window.confirm(
        "Activer la maintenance TOTALE ?\n\nLes visiteurs verront une page de maintenance (code 503) jusqu'à la réouverture. " +
          "Vous gardez l'accès à /admin et au lien d'aperçu."
      );
      if (!okConfirm) return;
    }

    setSaving(true);
    const { error: err } = await save(payload);
    setSaving(false);
    if (err) {
      setFormError(friendlyError(err));
      return;
    }
    setToast(mode === "off" ? "Le site est rouvert." : "Enregistré : visible des visiteurs dans 10 à 15 secondes.");
  };

  const copyPreview = async () => {
    try {
      await navigator.clipboard.writeText(previewUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      setFormError("Copie impossible : sélectionnez le lien à la main.");
    }
  };

  const submitLabel = mode === "off" ? "Rouvrir le site" : active ? "Enregistrer les changements" : mode === "full" ? "Activer la maintenance totale" : "Mettre la boutique en pause";

  return (
    <>
      <div className="flex justify-between items-center mb-5 gap-3">
        <div>
          <h1 className="font-serif text-2xl">Maintenance</h1>
          <p className="text-sm text-[#8b737e]">Mettre la boutique en pause, ou couper le site pour une intervention</p>
        </div>
        <button
          onClick={reload}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] px-4 h-10 text-sm disabled:opacity-60"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Actualiser
        </button>
      </div>

      {toast && <div className="mb-5 rounded-xl bg-emerald-50 text-emerald-700 px-4 py-3 text-sm">{toast}</div>}
      {error && <div className="mb-5 rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm" role="alert">{error}</div>}

      {/* État actuel */}
      {row && (
        <section
          data-testid="current-state"
          data-state={active ? row.mode : expired ? "expired" : "off"}
          className={`mb-6 rounded-2xl border px-5 py-4 ${
            active && row.mode === "full"
              ? "bg-red-50 border-red-200"
              : active
              ? "bg-amber-50 border-amber-200"
              : expired
              ? "bg-[#f5edf1] border-[#eadfe4]"
              : "bg-emerald-50 border-emerald-100"
          }`}
        >
          <div className="text-[10px] uppercase tracking-widest text-[#8b737e] mb-1">État actuel du site</div>
          <div className="font-serif text-xl">
            {active ? (row.mode === "full" ? "Maintenance totale" : "Boutique en pause") : "Site ouvert"}
          </div>
          {active && (
            <div className="text-[12px] text-[#54434c] mt-1.5 space-y-0.5 leading-5">
              {row.activated_at && (
                <div>
                  Activée le {formatDateTime(row.activated_at)} · {row.activated_by_email || "auteur non enregistré"}
                </div>
              )}
              <div>
                {row.auto_end_at ? "Réouverture automatique : " + formatReturnAt(row.auto_end_at) : "Réouverture manuelle (aucune fin programmée)"}
              </div>
              {row.message && <div>Message affiché : « {row.message} »</div>}
            </div>
          )}
          {expired && (
            <div className="text-[12px] text-[#54434c] mt-1.5 leading-5">
              La fin programmée est passée : le site est de nouveau ouvert pour les visiteurs. Enregistrez « Ouvert » pour clore la coupure.
            </div>
          )}
          {tooLong && (
            <div data-testid="too-long" className="mt-2 rounded-lg bg-white/70 text-red-700 px-3 py-2 text-[12px] leading-4">
              La maintenance totale dure depuis plus de 24 h : au-delà de 24 à 48 h, Google peut retirer des pages de son index. Rouvrez le site ou passez en « boutique en pause ».
            </div>
          )}
        </section>
      )}

      {/* Lien d'aperçu */}
      {previewUrl && (
        <section data-testid="preview-box" className="mb-6 rounded-2xl bg-white border border-[#eee2e5] px-5 py-4">
          <h2 className="font-serif text-lg mb-1">Voir le site pendant la coupure</h2>
          <p className="text-[12px] text-[#756a70] leading-5 mb-2">
            Ce lien secret ouvre le site normalement dans CE navigateur pendant 4 heures (un bandeau rouge le rappelle). Ne le partagez pas : il change à chaque
            nouvelle activation et cesse de fonctionner à la réouverture.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input readOnly value={previewUrl} aria-label="Lien d'aperçu" data-testid="preview-url" onFocus={(e) => e.target.select()} className="flex-1 min-w-[220px] rounded-xl border border-[#eadfe4] bg-[#faf6f8] px-3 h-10 text-xs outline-none" />
            <button type="button" onClick={copyPreview} className="flex items-center gap-1.5 rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] px-4 h-10 text-sm">
              <Copy size={14} /> {copied ? "Copié" : "Copier"}
            </button>
            <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-4 h-10 text-sm">
              <ExternalLink size={14} /> Ouvrir
            </a>
          </div>
        </section>
      )}

      {/* Formulaire */}
      <form onSubmit={onSubmit} data-testid="maintenance-form" className="rounded-2xl bg-white border border-[#eee2e5] p-5 mb-8">
        <h2 className="font-serif text-xl mb-3">Changer l&apos;état du site</h2>
        <div className="grid md:grid-cols-3 gap-3">
          {MODES.map((m) => (
            <label
              key={m.id}
              className={`rounded-xl border p-3 cursor-pointer block ${mode === m.id ? "border-[#8f6075] bg-[#faf6f8] ring-1 ring-[#8f6075]" : "border-[#eadfe4] hover:bg-[#faf6f8]"}`}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <input type="radio" name="mode" value={m.id} checked={mode === m.id} onChange={() => setMode(m.id)} data-testid={`mode-${m.id}`} className="h-4 w-4 accent-[#8f6075]" />
                {m.label}
              </span>
              <span className="block text-[11px] text-[#756a70] leading-4 mt-1.5">{m.description}</span>
            </label>
          ))}
        </div>

        {mode !== "off" && (
          <div className="mt-5 space-y-4" data-testid="mode-fields">
            <div>
              <label className="text-sm block">
                <span className="text-xs text-[#8b737e]">Message affiché aux visiteurs</span>
                <textarea
                  rows={3}
                  maxLength={500}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  data-testid="message"
                  placeholder="Ex. Inventaire en cours : la boutique reprend très bientôt."
                  className="mt-1 w-full rounded-xl border border-[#eadfe4] px-3 py-2 outline-none focus:border-[#8f6075]"
                />
              </label>
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                <span className="text-[11px] text-[#8b737e]">{message.length} / 500 · modèles :</span>
                {PRESETS.map((p) => (
                  <button key={p} type="button" onClick={() => setMessage(p)} className="rounded-full bg-[#f5edf1] hover:bg-[#ead9e1] px-3 py-1 text-[11px] text-[#826d77]">
                    {p.split(":")[0]}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <label className="text-sm block">
                <span className="text-xs text-[#8b737e]">Retour prévu (heure de votre ordinateur)</span>
                <input
                  type="datetime-local"
                  value={returnLocal}
                  onChange={(e) => setReturnLocal(e.target.value)}
                  data-testid="return-at"
                  className="mt-1 w-full rounded-xl border border-[#eadfe4] px-3 h-10 outline-none focus:border-[#8f6075]"
                />
              </label>
              <label className="flex items-end gap-2 text-sm pb-2">
                <input type="checkbox" checked={autoReopen} onChange={(e) => setAutoReopen(e.target.checked)} data-testid="auto-reopen" className="h-4 w-4 accent-[#8f6075]" />
                <span>Rouvrir automatiquement à cette heure</span>
              </label>
            </div>
            <p className="text-[11px] text-[#8b737e] leading-4">
              La réouverture automatique évite d&apos;oublier le site fermé : à l&apos;heure choisie, il se rouvre tout seul, même si personne n&apos;est connecté à /admin.
              Sans heure de retour, la réouverture se fait à la main.
            </p>
          </div>
        )}

        {formError && (
          <div className="mt-4 text-sm rounded-xl bg-red-50 text-red-600 px-4 py-3" role="alert" data-testid="form-error">
            {formError}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4 mt-5">
          <button
            type="submit"
            disabled={saving || loading || Boolean(error)}
            data-testid="submit"
            className={`rounded-full text-white px-6 h-11 text-sm font-medium disabled:opacity-60 ${mode === "full" ? "bg-red-600 hover:bg-red-700" : "bg-[#8f6075] hover:bg-[#71485b]"}`}
          >
            {saving ? "Enregistrement..." : submitLabel}
          </button>
          <span className="text-[11px] text-[#8b737e]">Pris en compte par les visiteurs en 10 à 15 secondes.</span>
        </div>
      </form>

      {/* Ce qui se passe */}
      <section className="rounded-2xl bg-[#faf6f8] border border-[#eee2e5] p-5 mb-8 text-[13px] leading-5 text-[#54434c]">
        <h2 className="font-serif text-lg mb-2">Ce qui se passe, et ce qui ne change pas</h2>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong>Maintenance totale</strong> : toutes les pages du site répondent par le code 503 avec une page de maintenance. /admin, la sonde de santé
            (/api/health), les images et les fichiers du site restent accessibles. Le futur webhook Stripe devra rester accessible lui aussi : il est déjà
            prévu dans les exclusions.
          </li>
          <li>
            <strong>Boutique en pause</strong> : le site reste ouvert et référencé normalement. Le panier de chaque visiteuse est conservé sur son appareil.
            Quand le paiement sera en place, le serveur devra aussi refuser les commandes pendant la pause.
          </li>
          <li>
            Si Supabase ne répond plus, le site <strong>reste ouvert</strong> (ou garde l&apos;état connu pendant 10 minutes) : une panne de lecture ne ferme jamais la boutique.
          </li>
          <li>Après une coupure, lancez le diagnostic (onglet Santé) pour vérifier que tout est rétabli.</li>
        </ul>
      </section>

      {/* Historique */}
      <section>
        <h2 className="font-serif text-xl mb-3">Historique</h2>
        <div className="rounded-2xl bg-white border border-[#eee2e5] overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]" data-testid="history">
            <thead>
              <tr className="bg-[#f5edf1] text-left text-[#8b737e]">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Par</th>
                <th className="px-4 py-3 font-medium">Changement</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Message</th>
              </tr>
            </thead>
            <tbody>
              {!loading && log.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-5 text-center text-[#8b737e]">Aucun changement enregistré pour le moment.</td>
                </tr>
              )}
              {log.map((l) => (
                <tr key={l.id} className="border-t border-[#eee2e5]">
                  <td className="px-4 py-2.5 whitespace-nowrap">{formatDateTime(l.at)}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{l.by_email || "—"}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {(MODES.find((m) => m.id === l.from_mode) || { label: l.from_mode }).label} → {(MODES.find((m) => m.id === l.to_mode) || { label: l.to_mode }).label}
                  </td>
                  <td className="px-4 py-2.5 hidden md:table-cell text-[#54434c]">{l.message || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
