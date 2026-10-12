import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  FAMILY_LIMITS,
  countByFamily,
  emptyFamilyForm,
  familyErrorMessage,
  familyToForm,
  isThinSeason,
  nextSortOrder,
  productsWithoutFamily,
  slugifyKey,
  validateFamilyForm,
} from "@/lib/families";

// ============================================================
// FAMILLES — onglet « Familles » de Produits
//
// Les familles regroupent les collections. Les 4 SAISONS (Printemps, Été, Automne, Hiver) sont utilisées par le quiz
// couleurs : elles se renomment et se décrivent librement, mais ne se suppriment pas et gardent leur identifiant
// technique. Les familles supplémentaires (« Édition limitée », par exemple) se créent et se suppriment à volonté ;
// elles apparaissent dans le catalogue mais pas dans le quiz.
//
// Les données sont dans la table « families » (voir supabase_themes_step2.sql). La logique (validation, messages
// d'erreur, décomptes) est dans lib/families.js. Les collections sont rattachées par products.family_id.
// L'ancien champ products.family (« Collection Bleus »...) n'est jamais modifié ici : le site actuel le lit encore.
// ============================================================

const INPUT = "mt-1 w-full rounded-xl border border-[#eadfe4] px-3 h-10 text-sm outline-none focus:border-[#8f6075] bg-white";

// Chargement des familles (un administrateur voit aussi les familles masquées)
export function useFamilies(enabled) {
  const [state, setState] = useState({ families: [], loading: true, error: "" });
  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    const { data, error } = await supabase.from("families").select("*").order("sort_order", { ascending: true }).order("id", { ascending: true });
    if (error) setState({ families: [], loading: false, error: familyErrorMessage(error) });
    else setState({ families: data || [], loading: false, error: "" });
  }, []);
  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);
  return { ...state, reload: load };
}

// Pastille « famille » : couleur d'accent et nom (ou « Sans famille »)
export function FamilyBadge({ family, loading }) {
  if (!family) {
    return loading ? (
      <span className="text-[#b0a3a9]">…</span>
    ) : (
      <span data-testid="no-family" className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 text-amber-700 px-2.5 py-0.5 text-xs">
        Sans famille
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <i className="inline-block h-2.5 w-2.5 rounded-full border border-black/10" style={{ background: family.accent || "#8f6075" }} />
      {family.name}
    </span>
  );
}

export default function AdminFamilies({ status, products, onProductsChanged }) {
  const families = status.families;
  const list = Array.isArray(products) ? products : [];
  const counts = useMemo(() => countByFamily(list), [list]);
  const orphans = useMemo(() => productsWithoutFamily(list), [list]);

  const [selectedId, setSelectedId] = useState(null); // null = fermé, "new" = création, sinon l'identifiant
  const [form, setForm] = useState(null);
  const [keyTouched, setKeyTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [busyProduct, setBusyProduct] = useState(null);
  const [attachId, setAttachId] = useState("");

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const selected = form && form.id ? families.find((f) => f.id === form.id) : null;

  const openNew = () => {
    setError("");
    setKeyTouched(false);
    setAttachId("");
    setForm(emptyFamilyForm(nextSortOrder(families)));
    setSelectedId("new");
  };
  const openEdit = (f) => {
    setError("");
    setAttachId("");
    setForm(familyToForm(f));
    setSelectedId(f.id);
  };
  const close = () => {
    setSelectedId(null);
    setForm(null);
    setError("");
  };
  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const onName = (value) =>
    setForm((f) => {
      const next = { ...f, name: value };
      if (!f.id && !keyTouched) next.key = slugifyKey(value);
      return next;
    });

  // --- palette ---
  const setPaletteColor = (i, value) => setForm((f) => ({ ...f, palette: f.palette.map((c, k) => (k === i ? value : c)) }));
  const addPaletteColor = () => setForm((f) => (f.palette.length >= FAMILY_LIMITS.palette ? f : { ...f, palette: [...f.palette, "#8f6075"] }));
  const removePaletteColor = (i) => setForm((f) => ({ ...f, palette: f.palette.filter((_, k) => k !== i) }));

  const save = async (e) => {
    e.preventDefault();
    setError("");
    const result = validateFamilyForm(form, families);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSaving(true);
    const query = form.id ? supabase.from("families").update(result.payload).eq("id", form.id) : supabase.from("families").insert(result.payload);
    const { error: err } = await query;
    setSaving(false);
    if (err) {
      setError(familyErrorMessage(err));
      return;
    }
    setToast(form.id ? "Famille mise à jour : le nouveau nom s'applique partout." : "Famille créée.");
    close();
    status.reload();
  };

  const remove = async (f) => {
    setError("");
    if (f.is_season) {
      setToast("");
      setError("« " + f.name + " » est une saison utilisée par le quiz : elle ne peut pas être supprimée.");
      return;
    }
    const n = counts.get(Number(f.id)) || 0;
    if (n > 0) {
      setError("« " + f.name + " » contient encore " + n + " collection" + (n > 1 ? "s" : "") + " : déplacez-les d'abord vers une autre famille.");
      return;
    }
    if (!window.confirm("Supprimer définitivement la famille « " + f.name + " » ? Cette action est irréversible.")) return;
    const { error: err } = await supabase.from("families").delete().eq("id", f.id);
    if (err) {
      setError(familyErrorMessage(err));
      return;
    }
    setToast("Famille supprimée.");
    if (selectedId === f.id) close();
    status.reload();
  };

  // Déplace une collection vers une autre famille. Sa saison voisine est retirée si elle devient identique à sa nouvelle famille.
  const moveProduct = async (p, targetId) => {
    if (!targetId) return;
    setError("");
    setBusyProduct(p.id);
    const patch = { family_id: Number(targetId) };
    if (p.neighbour_family_id !== null && p.neighbour_family_id !== undefined && Number(p.neighbour_family_id) === Number(targetId)) patch.neighbour_family_id = null;
    const { error: err } = await supabase.from("products").update(patch).eq("id", p.id);
    setBusyProduct(null);
    if (err) {
      setError(familyErrorMessage(err));
      return;
    }
    const target = families.find((f) => Number(f.id) === Number(targetId));
    setToast("« " + p.name + " » est maintenant dans « " + (target ? target.name : "?") + " ».");
    if (typeof onProductsChanged === "function") onProductsChanged();
  };

  const inSelected = selected ? list.filter((p) => Number(p.family_id) === Number(selected.id)) : [];
  const attachable = selected ? list.filter((p) => Number(p.family_id) !== Number(selected.id)) : [];
  const targetsFor = (p) => families.filter((f) => Number(f.id) !== Number(p.family_id));

  return (
    <div data-testid="families-tab">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-5">
        <div>
          <h1 className="font-serif text-2xl">Familles</h1>
          <p className="text-sm text-[#8b737e]">Les 4 saisons et les familles supplémentaires. Un nom modifié ici change partout sur le site, tout de suite.</p>
        </div>
        <button type="button" onClick={openNew} data-testid="family-new" className="flex items-center gap-1.5 rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-4 h-10 text-sm">
          <Plus size={16} /> Nouvelle famille
        </button>
      </div>

      {toast && (
        <div role="status" data-testid="family-toast" className="mb-4 rounded-xl bg-emerald-50 text-emerald-700 px-4 py-3 text-sm">
          {toast}
        </div>
      )}
      {status.error && (
        <div role="alert" data-testid="family-load-error" className="mb-4 rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm">
          {status.error}
        </div>
      )}
      {error && !form && (
        <div role="alert" data-testid="family-error" className="mb-4 rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {orphans.length > 0 && (
        <div data-testid="orphan-products" className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
          <div className="text-sm font-medium text-amber-900">
            {orphans.length} collection{orphans.length > 1 ? "s" : ""} sans famille
          </div>
          <p className="text-xs text-amber-800 mt-0.5 mb-3">Rangez-les dans une famille : le quiz et le catalogue par saison ne les proposent pas tant qu&apos;elles n&apos;en ont pas.</p>
          <ul className="space-y-2">
            {orphans.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 text-sm">
                <span className="min-w-[140px] font-medium">{p.name}</span>
                <select
                  data-testid="orphan-select"
                  aria-label={"Ranger " + p.name + " dans une famille"}
                  value=""
                  disabled={busyProduct === p.id}
                  onChange={(e) => moveProduct(p, e.target.value)}
                  className="rounded-lg border border-amber-300 bg-white px-2.5 h-9 text-sm outline-none focus:border-[#8f6075]"
                >
                  <option value="">Ranger dans…</option>
                  {families.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                      {f.active ? "" : " (masquée)"}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid lg:grid-cols-[1.25fr_1fr] gap-6 items-start">
        <div className="bg-white rounded-2xl border border-[#eee2e5] overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]" data-testid="family-table">
            <thead>
              <tr className="bg-[#f5edf1] text-left text-[#8b737e]">
                <th className="px-4 py-3 font-medium">Famille</th>
                <th className="px-4 py-3 font-medium">Palette</th>
                <th className="px-4 py-3 font-medium">Collections</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {status.loading && families.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-[#8b737e]">
                    Chargement des familles...
                  </td>
                </tr>
              )}
              {families.map((f) => {
                const n = counts.get(Number(f.id)) || 0;
                const thin = isThinSeason(f, n);
                return (
                  <tr
                    key={f.id}
                    data-testid="family-row"
                    data-key={f.key}
                    onClick={() => openEdit(f)}
                    className={`border-t border-[#eee2e5] cursor-pointer ${selectedId === f.id ? "bg-[#faf3f6]" : "hover:bg-[#fcf9fa]"}`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium flex items-center gap-2">
                        <i className="inline-block h-3 w-3 rounded-full border border-black/10" style={{ background: f.accent }} />
                        {f.name}
                      </div>
                      <div className="text-xs text-[#8b737e] mt-0.5">{f.is_season ? "Saison du quiz" : "Hors quiz"}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {(Array.isArray(f.palette) ? f.palette : []).map((c, i) => (
                          <i key={i} className="inline-block h-4 w-4 rounded-full border border-black/10" style={{ background: c }} />
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3" data-testid="family-count">
                      {n}
                      {thin && (
                        <div data-testid="thin-season" className="text-[11px] text-amber-700 mt-0.5">
                          Peu de choix pour le quiz
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-3 py-1 text-xs ${f.active ? "bg-emerald-50 text-emerald-700" : "bg-[#f0e6ea] text-[#8b737e]"}`}>{f.active ? "En ligne" : "Masquée"}</span>
                    </td>
                    <td className="px-4 py-3" onClick={(ev) => ev.stopPropagation()}>
                      <div className="flex justify-end gap-1.5">
                        <button type="button" onClick={() => openEdit(f)} className="h-8 w-8 grid place-items-center rounded-full hover:bg-[#f0e6ea]" aria-label={"Modifier " + f.name}>
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(f)}
                          disabled={f.is_season}
                          title={f.is_season ? "Une saison ne se supprime pas" : "Supprimer la famille"}
                          className={`h-8 w-8 grid place-items-center rounded-full ${f.is_season ? "text-[#d3c6cc] cursor-not-allowed" : "hover:bg-[#f0e6ea] text-red-600"}`}
                          aria-label={"Supprimer " + f.name}
                        >
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

        {form ? (
          <form onSubmit={save} className="bg-white rounded-[1.5rem] border border-[#eee2e5] shadow-xl p-6" data-testid="family-editor">
            <div className="flex justify-between items-start mb-4">
              <h2 className="font-serif text-2xl">{form.id ? "Modifier la famille « " + (selected ? selected.name : form.name) + " »" : "Nouvelle famille"}</h2>
              <button type="button" onClick={close} className="h-9 w-9 grid place-items-center rounded-full hover:bg-[#f0e6ea]" aria-label="Fermer">
                <X size={18} />
              </button>
            </div>
            {form.is_season && (
              <div className="mb-4 rounded-xl bg-[#faf6f8] border border-[#eee2e5] px-3.5 py-2.5 text-xs text-[#6b5a63] leading-5" data-testid="season-lock">
                Saison utilisée par le quiz : le nom et la description se modifient, mais la famille ne peut pas être supprimée ni masquée.
              </div>
            )}
            {error && (
              <div role="alert" data-testid="family-form-error" className="mb-4 text-sm rounded-xl bg-red-50 text-red-600 px-4 py-3">
                {error}
              </div>
            )}

            <div className="space-y-3 text-sm">
              <label className="block">
                <span className="text-xs text-[#8b737e]">Nom affiché sur le site</span>
                <input data-testid="ff-name" value={form.name} maxLength={FAMILY_LIMITS.name} onChange={(e) => onName(e.target.value)} className={INPUT} />
              </label>
              {form.id ? (
                <div className="text-[11px] text-[#8b737e]">
                  Identifiant technique : <code className="rounded bg-[#f5edf1] px-1">{form.key}</code> (non modifiable : le site s&apos;en sert)
                </div>
              ) : (
                <label className="block">
                  <span className="text-xs text-[#8b737e]">Identifiant technique (non modifiable après la création)</span>
                  <input
                    data-testid="ff-key"
                    value={form.key}
                    maxLength={FAMILY_LIMITS.keyMax}
                    onChange={(e) => {
                      setKeyTouched(true);
                      setField("key", e.target.value.toLowerCase());
                    }}
                    placeholder="ex. edition-limitee"
                    className={INPUT}
                  />
                  <span className="text-[11px] text-[#8b737e]">Lettres minuscules, chiffres et tirets. Proposé à partir du nom.</span>
                </label>
              )}
              <label className="block">
                <span className="text-xs text-[#8b737e]">Phrase d&apos;accroche (affichée sur la carte)</span>
                <input data-testid="ff-tagline" value={form.tagline} maxLength={FAMILY_LIMITS.tagline} onChange={(e) => setField("tagline", e.target.value)} className={INPUT} />
              </label>
              <label className="block">
                <span className="text-xs text-[#8b737e]">Description courte</span>
                <textarea
                  data-testid="ff-description"
                  rows={2}
                  maxLength={FAMILY_LIMITS.description}
                  value={form.description}
                  onChange={(e) => setField("description", e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#eadfe4] px-3 py-2 text-sm outline-none focus:border-[#8f6075] bg-white"
                />
              </label>
              <div className="flex items-end gap-4">
                <label className="block">
                  <span className="text-xs text-[#8b737e]">Couleur d&apos;accent</span>
                  <input data-testid="ff-accent" type="color" value={form.accent} onChange={(e) => setField("accent", e.target.value)} className="mt-1 block h-10 w-14 rounded-xl border border-[#eadfe4] bg-white p-1" />
                </label>
                <label className={`flex items-center gap-2 pb-2 ${form.is_season ? "opacity-60" : ""}`}>
                  <input data-testid="ff-active" type="checkbox" checked={form.is_season ? true : form.active} disabled={form.is_season} onChange={(e) => setField("active", e.target.checked)} className="h-4 w-4" />
                  <span>Visible sur le site</span>
                </label>
              </div>
              <div>
                <span className="text-xs text-[#8b737e]">Palette (aperçu sur les cartes, {FAMILY_LIMITS.palette} couleurs au plus)</span>
                <div className="mt-1.5 flex flex-wrap items-center gap-2" data-testid="ff-palette">
                  {form.palette.map((c, i) => (
                    <span key={i} className="relative inline-block">
                      <input type="color" value={c} onChange={(e) => setPaletteColor(i, e.target.value)} aria-label={"Couleur " + (i + 1) + " de la palette"} className="block h-9 w-9 rounded-xl border border-[#eadfe4] bg-white p-0.5" />
                      <button
                        type="button"
                        onClick={() => removePaletteColor(i)}
                        aria-label={"Retirer la couleur " + (i + 1)}
                        className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-black/60 text-white grid place-items-center hover:bg-black/80"
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                  {form.palette.length < FAMILY_LIMITS.palette && (
                    <button type="button" data-testid="ff-palette-add" onClick={addPaletteColor} className="h-9 w-9 rounded-xl border-2 border-dashed border-[#d9c5cc] grid place-items-center text-[#8f6075]" aria-label="Ajouter une couleur à la palette">
                      <Plus size={16} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {form.id && selected && (
              <div className="mt-5" data-testid="family-products">
                <span className="text-sm font-medium">Collections rattachées ({inSelected.length})</span>
                <ul className="mt-2 divide-y divide-[#f0e6ea] rounded-xl border border-[#eee2e5]">
                  {inSelected.length === 0 && <li className="px-3 py-3 text-xs text-[#8b737e]">Aucune collection.</li>}
                  {inSelected.map((p) => (
                    <li key={p.id} data-testid="family-product" className="px-3 py-2 flex flex-wrap items-center gap-3 text-sm">
                      <span className="flex-1 min-w-[120px]">
                        {p.name}
                        {!p.active && <span className="ml-2 text-xs text-[#8b737e]">(masquée)</span>}
                      </span>
                      <select
                        data-testid="move-select"
                        aria-label={"Déplacer " + p.name}
                        value=""
                        disabled={busyProduct === p.id}
                        onChange={(e) => moveProduct(p, e.target.value)}
                        className="rounded-lg border border-[#e3d3da] bg-white px-2 h-8 text-xs text-[#54434c] outline-none focus:border-[#8f6075]"
                      >
                        <option value="">Déplacer vers…</option>
                        {targetsFor(p).map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                            {f.active ? "" : " (masquée)"}
                          </option>
                        ))}
                      </select>
                    </li>
                  ))}
                </ul>
                {attachable.length > 0 && (
                  <div className="mt-3 rounded-xl bg-[#faf6f8] border border-[#eee2e5] p-3">
                    <div className="text-xs text-[#756a70] mb-2">Rattacher une collection existante à « {selected.name} »</div>
                    <div className="flex gap-2">
                      <select data-testid="attach-select" value={attachId} onChange={(e) => setAttachId(e.target.value)} className="flex-1 min-w-0 rounded-lg border border-[#e3d3da] bg-white px-2 h-9 text-sm outline-none focus:border-[#8f6075]">
                        <option value="">Choisir une collection…</option>
                        {attachable.map((p) => {
                          const fam = families.find((f) => Number(f.id) === Number(p.family_id));
                          return (
                            <option key={p.id} value={p.id}>
                              {p.name} ({fam ? fam.name : "sans famille"})
                            </option>
                          );
                        })}
                      </select>
                      <button
                        type="button"
                        data-testid="attach-button"
                        disabled={!attachId || busyProduct !== null}
                        onClick={async () => {
                          const p = list.find((x) => String(x.id) === String(attachId));
                          if (p) {
                            await moveProduct(p, selected.id);
                            setAttachId("");
                          }
                        }}
                        className="rounded-full bg-white border border-[#d9c5cc] px-4 h-9 text-sm disabled:opacity-50"
                      >
                        Déplacer ici
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-3 mt-5">
              <button type="submit" data-testid="family-save" disabled={saving} className="flex-1 min-w-[140px] rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white h-11 text-sm font-medium disabled:opacity-60">
                {saving ? "Enregistrement..." : "Enregistrer"}
              </button>
              <button type="button" onClick={close} className="rounded-full border border-[#d9c5cc] px-6 h-11 text-sm">
                Annuler
              </button>
              {form.id && !form.is_season && (
                <button type="button" data-testid="family-delete" onClick={() => selected && remove(selected)} className="rounded-full border border-red-200 text-red-600 px-5 h-11 text-sm hover:bg-red-50">
                  Supprimer
                </button>
              )}
            </div>
          </form>
        ) : (
          <div className="bg-white rounded-[1.5rem] border border-dashed border-[#e3d3da] p-6 text-sm text-[#8b737e] leading-6" data-testid="family-hint">
            Choisissez une famille dans la liste pour la modifier, voir ses collections ou en déplacer une. Les saisons alimentent le quiz couleurs : elles se renomment et se décrivent librement, mais ne se suppriment pas.
          </div>
        )}
      </div>
    </div>
  );
}
