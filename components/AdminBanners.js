import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import BannerBar from "@/components/BannerBar";
import {
  BANNER_LIMITS,
  BANNER_STATUS_LABEL,
  BUTTON_TARGETS,
  bannerErrorMessage,
  bannerRange,
  bannerStatus,
  bannerToForm,
  bannerVisibility,
  emptyBannerForm,
  formRange,
  messageWarnings,
  pickCurrentBanner,
  syncIssues,
  validateBanner,
} from "@/lib/banners";
import { addDaysParis, daysBetween, formatParis, isoToParisLocal } from "@/lib/parisTime";

// ============================================================
// BANDEAUX — section de l'onglet « Codes promo » (Produits > Codes promo)
//
// Un bandeau est le message affiché tout en haut du site pour une occasion : fête des mères, Noël, nouveautés...
// Il peut être associé à un code promo, avec des dates de début et de fin (heure de Paris), un bouton, une priorité
// et un compte à rebours facultatif (jours et heures). Un seul bandeau s'affiche à la fois : le plus prioritaire.
//
// Les données sont dans la table « banners » (voir supabase_themes_step2.sql). La logique (statuts, validation, dates)
// est dans lib/banners.js et lib/parisTime.js. Un nouveau bandeau est créé DÉSACTIVÉ : rien ne s'affiche par accident.
// ============================================================

const INPUT = "mt-1 w-full rounded-xl border border-[#eadfe4] px-3 h-10 text-sm outline-none focus:border-[#8f6075] bg-white";

function Switch({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${checked ? "bg-[#8f6075]" : "bg-[#d9c5cc]"}`}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}

const VISIBILITY_STYLE = {
  shown: "text-emerald-700",
  waiting: "text-[#8b737e]",
  disabled: "text-[#8b737e]",
  "hidden-pause": "text-amber-700",
  "hidden-full": "text-amber-700",
  none: "text-[#b0a3a9]",
};

export default function AdminBanners({ promoCodes, onCodesChanged, siteMode = "off" }) {
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedId, setSelectedId] = useState(null); // null = fermé, "new" = création, sinon l'identifiant
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [toast, setToast] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());

  const codes = Array.isArray(promoCodes) ? promoCodes : [];

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("banners").select("*").order("priority", { ascending: true }).order("starts_at", { ascending: false });
    if (error) {
      setLoadError(bannerErrorMessage(error));
      setBanners([]);
    } else {
      setLoadError("");
      setBanners(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Les statuts (programmé, en cours, terminé) suivent l'heure : on les rafraîchit toutes les 30 secondes
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const shown = useMemo(() => pickCurrentBanner(banners, nowMs), [banners, nowMs]);

  const openNew = () => {
    setFormError("");
    setForm(emptyBannerForm(Date.now()));
    setSelectedId("new");
  };
  const openEdit = (b) => {
    setFormError("");
    setForm(bannerToForm(b));
    setSelectedId(b.id);
  };
  const closeEditor = () => {
    setSelectedId(null);
    setForm(null);
    setFormError("");
  };

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  // Changement de mode : la valeur de l'autre mode est déduite, pour ne rien perdre
  const setMode = (mode) =>
    setForm((f) => {
      if (f.mode === mode) return f;
      if (mode === "duration") {
        const r = formRange(f);
        return { ...f, mode, days: r ? daysBetween(r.startIso, r.endIso) : f.days || 7 };
      }
      const r = formRange(f);
      return { ...f, mode, end: r ? isoToParisLocal(r.endIso) : f.end };
    });

  const range = form ? formRange(form) : null;
  const codeRow = form && form.code ? codes.find((c) => c.code === form.code) : undefined;

  const issues = useMemo(() => {
    if (!form) return [];
    const list = messageWarnings(form.message, form.code).map((text) => ({ level: "info", text }));
    if (range && form.code) {
      return list.concat(syncIssues(form.code, [new Date(range.startIso).getTime(), new Date(range.endIso).getTime()], codeRow));
    }
    return list;
  }, [form, range, codeRow]);

  // Le code est « aligné » quand ses dates de début et de fin sont exactement celles du bandeau
  const codeMatches = Boolean(
    codeRow &&
      range &&
      codeRow.starts_at &&
      codeRow.ends_at &&
      new Date(codeRow.starts_at).getTime() === new Date(range.startIso).getTime() &&
      new Date(codeRow.ends_at).getTime() === new Date(range.endIso).getTime()
  );
  const datesDiffer = Boolean(range && codeRow) && !codeMatches;
  const allAligned = Boolean(form && form.code && codeRow && range && issues.length === 0 && codeMatches);

  const alignCode = async () => {
    if (!range || !codeRow) return;
    setFormError("");
    const { error } = await supabase.from("promo_codes").update({ starts_at: range.startIso, ends_at: range.endIso }).eq("code", codeRow.code);
    if (error) {
      setFormError("Le code n'a pas pu être aligné : " + bannerErrorMessage(error));
      return;
    }
    setToast("Les dates du code « " + codeRow.code + " » sont alignées sur le bandeau.");
    if (typeof onCodesChanged === "function") onCodesChanged();
  };

  const save = async (e) => {
    e.preventDefault();
    setFormError("");
    const result = validateBanner(form);
    if (result.error) {
      setFormError(result.error);
      return;
    }
    setSaving(true);
    const query = form.id ? supabase.from("banners").update(result.payload).eq("id", form.id) : supabase.from("banners").insert(result.payload);
    const { error } = await query;
    setSaving(false);
    if (error) {
      setFormError(bannerErrorMessage(error));
      return;
    }
    setToast(form.id ? "Bandeau mis à jour." : "Bandeau créé (désactivé tant que vous ne l'activez pas).");
    closeEditor();
    load();
  };

  const remove = async (b) => {
    if (!window.confirm("Supprimer définitivement le bandeau « " + b.name + " » ? Cette action est irréversible.")) return;
    const { error } = await supabase.from("banners").delete().eq("id", b.id);
    if (error) {
      setLoadError(bannerErrorMessage(error));
      return;
    }
    setToast("Bandeau supprimé.");
    if (selectedId === b.id) closeEditor();
    load();
  };

  const toggleEnabled = async (b) => {
    const { error } = await supabase.from("banners").update({ enabled: !b.enabled }).eq("id", b.id);
    if (error) {
      setLoadError(bannerErrorMessage(error));
      return;
    }
    load();
  };

  const sorted = useMemo(() => banners.slice().sort((a, b) => a.priority - b.priority || new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime() || a.id - b.id), [banners]);

  // Bandeau tel que le verra la visiteuse (aperçu)
  const previewBanner = form
    ? {
        id: 0,
        message: form.message,
        code: form.code || null,
        button_label: form.button_label,
        button_target: form.button_target,
        button_url: form.button_url,
        countdown: form.countdown,
        starts_at: range ? range.startIso : new Date(nowMs).toISOString(),
        ends_at: range ? range.endIso : new Date(nowMs + 7 * 86400000).toISOString(),
      }
    : null;

  return (
    <section className="mt-12" data-testid="banners-section">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-1">
        <div>
          <h2 className="font-serif text-2xl flex items-center gap-2">
            Bandeaux
          </h2>
          <p className="text-sm text-[#8b737e]">Le message affiché tout en haut du site pour une occasion : fête des mères, Noël, nouveautés. Un seul s&apos;affiche à la fois.</p>
        </div>
        <button
          type="button"
          onClick={openNew}
          data-testid="banner-new"
          className="flex items-center gap-1.5 rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-4 h-10 text-sm"
        >
          <Plus size={16} /> Nouveau bandeau
        </button>
      </div>

      {toast && (
        <div role="status" data-testid="banner-toast" className="mt-3 rounded-xl bg-emerald-50 text-emerald-700 px-4 py-3 text-sm">
          {toast}
        </div>
      )}
      {loadError && (
        <div role="alert" data-testid="banner-load-error" className="mt-3 rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm">
          {loadError}
        </div>
      )}

      <div className="mt-4 bg-white rounded-2xl border border-[#eee2e5] overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm" data-testid="banner-table">
          <thead>
            <tr className="bg-[#f5edf1] text-left text-[#8b737e]">
              <th className="px-4 py-3 font-medium">Bandeau</th>
              <th className="px-4 py-3 font-medium">Code</th>
              <th className="px-4 py-3 font-medium">Période</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 font-medium">Sur le site</th>
              <th className="px-4 py-3 font-medium">Priorité</th>
              <th className="px-4 py-3 font-medium">Activé</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-[#8b737e]">
                  Chargement des bandeaux...
                </td>
              </tr>
            )}
            {!loading && sorted.length === 0 && !loadError && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-[#8b737e]">
                  Aucun bandeau pour le moment. Cliquez sur « Nouveau bandeau » pour en créer un.
                </td>
              </tr>
            )}
            {sorted.map((b) => {
              const st = bannerStatus(b, nowMs);
              const vis = bannerVisibility(b, nowMs, shown, siteMode);
              const [s, e] = bannerRange(b);
              return (
                <tr
                  key={b.id}
                  data-testid="banner-row"
                  data-id={b.id}
                  onClick={() => openEdit(b)}
                  className={`border-t border-[#eee2e5] cursor-pointer ${selectedId === b.id ? "bg-[#faf3f6]" : "hover:bg-[#fcf9fa]"}`}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">{b.name}</div>
                    <div className="text-xs text-[#8b737e] mt-0.5 max-w-[260px] truncate">{b.message}</div>
                  </td>
                  <td className="px-4 py-3 text-xs">{b.code ? b.code : <span className="text-[#b0a3a9]">Aucun</span>}</td>
                  <td className="px-4 py-3 text-xs">
                    <span className="whitespace-nowrap">{formatParis(new Date(s).toISOString())}</span>
                    <span className="text-[#b0a3a9]"> → </span>
                    <span className="whitespace-nowrap">{formatParis(new Date(e).toISOString())}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-3 py-1 text-xs whitespace-nowrap ${BANNER_STATUS_LABEL[st].style}`}>{BANNER_STATUS_LABEL[st].label}</span>
                  </td>
                  <td className={`px-4 py-3 text-xs ${VISIBILITY_STYLE[vis.key]}`} data-testid="banner-visibility">
                    {vis.label}
                  </td>
                  <td className="px-4 py-3 text-xs">{b.priority}</td>
                  <td className="px-4 py-3" onClick={(ev) => ev.stopPropagation()}>
                    <Switch checked={b.enabled} onChange={() => toggleEnabled(b)} label={"Activer ou désactiver le bandeau " + b.name} />
                  </td>
                  <td className="px-4 py-3" onClick={(ev) => ev.stopPropagation()}>
                    <div className="flex justify-end gap-1.5">
                      <button type="button" onClick={() => openEdit(b)} className="h-8 w-8 grid place-items-center rounded-full hover:bg-[#f0e6ea]" aria-label={"Modifier " + b.name}>
                        <Pencil size={15} />
                      </button>
                      <button type="button" onClick={() => remove(b)} className="h-8 w-8 grid place-items-center rounded-full hover:bg-[#f0e6ea] text-red-600" aria-label={"Supprimer " + b.name}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {form && (
        <form onSubmit={save} className="mt-6 bg-white rounded-[1.5rem] border border-[#eee2e5] shadow-xl p-6 sm:p-7" data-testid="banner-editor">
          <div className="flex flex-wrap justify-between items-start gap-3 mb-5">
            <div>
              <h3 className="font-serif text-2xl">{form.id ? "Modifier le bandeau" : "Nouveau bandeau"}</h3>
              <p className="text-xs text-[#8b737e] mt-1">Un seul bandeau s&apos;affiche à la fois : le plus prioritaire parmi ceux qui sont activés et en cours.</p>
            </div>
            <button type="button" onClick={closeEditor} className="h-9 w-9 grid place-items-center rounded-full hover:bg-[#f0e6ea]" aria-label="Fermer l'éditeur">
              <X size={18} />
            </button>
          </div>

          {formError && (
            <div role="alert" data-testid="banner-form-error" className="mb-4 text-sm rounded-xl bg-red-50 text-red-600 px-4 py-3">
              {formError}
            </div>
          )}

          <div className="grid lg:grid-cols-2 gap-x-8 gap-y-4 text-sm">
            <div className="space-y-4">
              <label className="block">
                <span className="text-xs text-[#8b737e]">Nom interne (non affiché)</span>
                <input data-testid="bf-name" value={form.name} maxLength={BANNER_LIMITS.name} onChange={(e) => setField("name", e.target.value)} className={INPUT} />
              </label>
              <label className="block">
                <span className="text-xs text-[#8b737e]">Message affiché</span>
                <textarea
                  data-testid="bf-message"
                  rows={3}
                  value={form.message}
                  onChange={(e) => setField("message", e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#eadfe4] px-3 py-2 text-sm outline-none focus:border-[#8f6075] bg-white leading-6"
                />
                <span className="text-[11px] text-[#8b737e]">
                  {form.message.length}/{BANNER_LIMITS.message} caractères. Vous pouvez écrire <code className="rounded bg-[#f5edf1] px-1">{"{code}"}</code> et{" "}
                  <code className="rounded bg-[#f5edf1] px-1">{"{fin}"}</code> : ils sont remplacés automatiquement, pour rester cohérents avec le code et la date de fin.
                </span>
              </label>
              <label className="block">
                <span className="text-xs text-[#8b737e]">Code promo associé (facultatif)</span>
                <select data-testid="bf-code" value={form.code} onChange={(e) => setField("code", e.target.value)} className={INPUT}>
                  <option value="">Aucun code</option>
                  {form.code && !codeRow && <option value={form.code}>{form.code} (introuvable)</option>}
                  {codes.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} — {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-[#8b737e]">Texte du bouton</span>
                  <input data-testid="bf-button-label" value={form.button_label} maxLength={BANNER_LIMITS.buttonLabel} onChange={(e) => setField("button_label", e.target.value)} className={INPUT} />
                </label>
                <label className="block">
                  <span className="text-xs text-[#8b737e]">Le bouton mène vers</span>
                  <select data-testid="bf-button-target" value={form.button_target} onChange={(e) => setField("button_target", e.target.value)} className={INPUT}>
                    {BUTTON_TARGETS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {form.button_target === "custom" && (
                <label className="block">
                  <span className="text-xs text-[#8b737e]">Adresse du lien</span>
                  <input data-testid="bf-button-url" value={form.button_url} onChange={(e) => setField("button_url", e.target.value)} placeholder="/quiz ou https://..." className={INPUT} />
                  <span className="text-[11px] text-[#8b737e]">Une adresse du site (par exemple /quiz) ou une adresse commençant par https://.</span>
                </label>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <span className="text-xs text-[#8b737e]">Période d&apos;affichage (heure de Paris)</span>
                <div className="mt-1.5 flex gap-2">
                  <button
                    type="button"
                    data-testid="bf-mode-dates"
                    onClick={() => setMode("dates")}
                    className={`rounded-full border px-4 h-9 text-sm ${form.mode === "dates" ? "bg-[#8f6075] text-white border-[#8f6075]" : "bg-white border-[#d9c5cc] text-[#54434c]"}`}
                  >
                    Dates précises
                  </button>
                  <button
                    type="button"
                    data-testid="bf-mode-duration"
                    onClick={() => setMode("duration")}
                    className={`rounded-full border px-4 h-9 text-sm ${form.mode === "duration" ? "bg-[#8f6075] text-white border-[#8f6075]" : "bg-white border-[#d9c5cc] text-[#54434c]"}`}
                  >
                    Début + durée
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs text-[#8b737e]">Début</span>
                    <input data-testid="bf-start" type="datetime-local" value={form.start} onChange={(e) => setField("start", e.target.value)} className={INPUT} />
                  </label>
                  {form.mode === "dates" ? (
                    <label className="block">
                      <span className="text-xs text-[#8b737e]">Fin</span>
                      <input data-testid="bf-end" type="datetime-local" value={form.end} onChange={(e) => setField("end", e.target.value)} className={INPUT} />
                    </label>
                  ) : (
                    <label className="block">
                      <span className="text-xs text-[#8b737e]">Durée (jours)</span>
                      <input data-testid="bf-days" type="number" min={BANNER_LIMITS.daysMin} max={BANNER_LIMITS.daysMax} value={form.days} onChange={(e) => setField("days", e.target.value)} className={INPUT} />
                    </label>
                  )}
                </div>
                {form.mode === "duration" && (
                  <div className="text-[11px] text-[#8b737e] mt-1.5">
                    Fin calculée : <span data-testid="bf-computed-end">{range ? formatParis(range.endIso) : "—"}</span>
                  </div>
                )}
              </div>
              <label className="block">
                <span className="text-xs text-[#8b737e]">Priorité (1 = affiché en premier)</span>
                <select data-testid="bf-priority" value={form.priority} onChange={(e) => setField("priority", Number(e.target.value))} className={INPUT}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <div className="rounded-xl border border-[#eee2e5] p-4 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium">Compte à rebours</div>
                    <div className="text-[11px] text-[#8b737e] leading-4 mt-0.5">Affiche « Plus que 3 j 4 h » : des jours et des heures, sans secondes qui défilent. Désactivé par défaut.</div>
                  </div>
                  <span data-testid="bf-countdown">
                    <Switch checked={form.countdown} onChange={() => setField("countdown", !form.countdown)} label="Compte à rebours" />
                  </span>
                </div>
                <div className="flex items-start justify-between gap-4 pt-3 border-t border-[#f3eaee]">
                  <div>
                    <div className="text-sm font-medium">Bandeau activé</div>
                    <div className="text-[11px] text-[#8b737e] leading-4 mt-0.5">Interrupteur manuel. Le statut (programmé, en cours, terminé) suit les dates.</div>
                  </div>
                  <span data-testid="bf-enabled">
                    <Switch checked={form.enabled} onChange={() => setField("enabled", !form.enabled)} label="Bandeau activé" />
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <div className="text-xs text-[#8b737e] mb-2">Aperçu (tel que la visiteuse le voit)</div>
            <div className="rounded-xl overflow-hidden border border-[#eee2e5]" data-testid="banner-preview">
              <BannerBar banner={previewBanner} nowMs={nowMs} inert />
            </div>
            {!range && <div className="text-[11px] text-amber-700 mt-1.5">Complétez les dates pour voir la date de fin et le décompte réels.</div>}
          </div>

          <div className="mt-4" data-testid="banner-issues">
            {allAligned && (
              <div data-testid="banner-aligned" className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-xs text-emerald-800">
                Les dates du bandeau et du code « {form.code} » sont alignées.
              </div>
            )}
            {issues.length > 0 && (
              <div className={`rounded-xl border px-4 py-3 text-xs leading-5 ${issues.some((x) => x.level === "warn") ? "bg-amber-50 border-amber-200 text-amber-900" : "bg-[#faf6f8] border-[#eee2e5] text-[#6b5a63]"}`}>
                <div className="font-medium mb-1">À vérifier</div>
                <ul className="list-disc pl-5 space-y-0.5">
                  {issues.map((x, i) => (
                    <li key={i}>{x.text}</li>
                  ))}
                </ul>
                {datesDiffer && (
                  <button type="button" data-testid="banner-align" onClick={alignCode} className="mt-2.5 rounded-full bg-white border border-[#d9c5cc] hover:bg-[#f5edf1] px-4 py-1.5 text-xs text-[#54434c]">
                    Aligner le code sur le bandeau
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-3 mt-6">
            <button type="submit" data-testid="banner-save" disabled={saving} className="flex-1 min-w-[160px] rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white h-11 text-sm font-medium disabled:opacity-60">
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
            <button type="button" onClick={closeEditor} className="rounded-full border border-[#d9c5cc] px-6 h-11 text-sm">
              Annuler
            </button>
            {form.id && (
              <button
                type="button"
                data-testid="banner-delete"
                onClick={() => remove({ id: form.id, name: form.name })}
                className="rounded-full border border-red-200 text-red-600 px-5 h-11 text-sm hover:bg-red-50"
              >
                Supprimer
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
