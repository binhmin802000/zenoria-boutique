#!/usr/bin/env node
// ============================================================
// patch-admin-saisons.mjs — adapte pages/admin.js au thème des 4 saisons (étape 3)
//
// Usage (depuis le dossier du projet) :
//   node scripts/patch-admin-saisons.mjs --verifier     ne modifie RIEN : vérifie que le fichier peut être adapté
//   node scripts/patch-admin-saisons.mjs                adapte pages/admin.js (après une copie de sauvegarde)
//   node scripts/patch-admin-saisons.mjs autre/chemin.js
//
// Pourquoi un script plutôt qu'un fichier complet : votre admin.js reste IDENTIQUE à l'octet près partout où il n'est pas
// touché. Le script ne fait que 28 modifications ciblées. Avant d'écrire quoi que ce soit, il vérifie que chaque endroit
// à modifier existe UNE SEULE fois ; au moindre doute, il s'arrête et le fichier n'est pas modifié.
//
// Ce qui change dans admin.js :
//   - onglet Familles et liste « Famille » alimentés par la base (au lieu de 4 familles écrites dans le code) ;
//   - fiche collection : saison voisine, couleurs dominantes (0 à 3) ; la « Composition en cristaux » disparaît du formulaire ;
//   - codes promo : dates de début et de fin, statut qui suit les dates ;
//   - section « Bandeaux » sous la liste des codes promo.
// Les colonnes de la base ne sont pas supprimées : la composition en cristaux reste en base, simplement plus envoyée.
// ============================================================
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const checkOnly = args.includes("--verifier") || args.includes("--check");
const target = args.find((a) => !a.startsWith("--")) || "pages/admin.js";

const fail = (msg) => {
  console.error("\n✗ " + msg);
  console.error("  Aucun fichier n'a été modifié.");
  process.exit(1);
};

if (!fs.existsSync(target)) fail("Fichier introuvable : " + target + ". Lancez le script depuis le dossier du projet (celui qui contient package.json).");

// ------------------------------------------------------------
// Lecture : on garde le saut de ligne d'origine (Windows : \r\n) et l'éventuel BOM
// ------------------------------------------------------------
const rawText = fs.readFileSync(target, "utf8");
const hasBom = rawText.charCodeAt(0) === 0xfeff;
const text = hasBom ? rawText.slice(1) : rawText;
const eol = text.includes("\r\n") ? "\r\n" : "\n";
const endsWithEol = /\r?\n$/.test(text);
let lines = text.split(/\r?\n/);
if (endsWithEol) lines.pop();

if (lines.some((l) => l.includes("useFamilies"))) {
  console.log("✓ pages/admin.js est déjà adapté au thème des saisons (useFamilies présent). Rien à faire.");
  process.exit(0);
}
if (!lines.some((l) => l.trim().startsWith("export default function AdminPage"))) fail("Ce fichier ne ressemble pas au admin.js attendu (« export default function AdminPage » introuvable).");

// ------------------------------------------------------------
// Outils : toutes les recherches ignorent l'indentation (seules les lignes entières « nettoyées » comptent)
// ------------------------------------------------------------
const log = [];
const t = (i) => lines[i].trim();
const indentOf = (line) => line.match(/^\s*/)[0];

function findAll(pred) {
  const out = [];
  lines.forEach((l, i) => {
    if (pred(l.trim(), l)) out.push(i);
  });
  return out;
}
function findOne(label, pred, from = 0) {
  const found = findAll((s, l) => pred(s, l)).filter((i) => i >= from);
  if (found.length === 0) throw new Error(label + " : repère introuvable dans le fichier.");
  if (found.length > 1 && from === 0) throw new Error(label + " : " + found.length + " endroits correspondent (lignes " + found.map((i) => i + 1).join(", ") + "), un seul était attendu.");
  return found[0];
}
// Premier repère APRÈS une ligne donnée
function findAfter(label, startIdx, pred) {
  for (let i = startIdx + 1; i < lines.length; i++) if (pred(lines[i].trim(), lines[i])) return i;
  throw new Error(label + " : repère introuvable après la ligne " + (startIdx + 1) + ".");
}
// Dernier repère AVANT une ligne donnée
function findBefore(label, startIdx, pred) {
  for (let i = startIdx - 1; i >= 0; i--) if (pred(lines[i].trim(), lines[i])) return i;
  throw new Error(label + " : repère introuvable avant la ligne " + (startIdx + 1) + ".");
}
// Un bloc est écrit sans indentation de base : on y ajoute celle de la ligne de référence
function block(textBlock, baseIndent) {
  return textBlock
    .replace(/^\n/, "")
    .replace(/\n$/, "")
    .split("\n")
    .map((l) => (l.length ? baseIndent + l : l));
}
function replaceLines(label, from, to, textBlock) {
  const base = indentOf(lines[from]);
  lines.splice(from, to - from + 1, ...block(textBlock, base));
  log.push(label);
}
function insertAfter(label, idx, textBlock) {
  const base = indentOf(lines[idx]);
  lines.splice(idx + 1, 0, ...block(textBlock, base));
  log.push(label);
}
function insertBefore(label, idx, textBlock) {
  const base = indentOf(lines[idx]);
  lines.splice(idx, 0, ...block(textBlock, base));
  log.push(label);
}
// Équilibre des <div ... > / </div> à partir d'une ligne d'ouverture : renvoie la ligne de fermeture
function closingDivOf(startIdx) {
  let depth = 0;
  for (let i = startIdx; i < lines.length; i++) {
    const opens = (lines[i].match(/<div[\s>]/g) || []).length;
    const closes = (lines[i].match(/<\/div>/g) || []).length;
    depth += opens - closes;
    if (depth <= 0 && i >= startIdx) return i;
  }
  throw new Error("balise <div> non refermée à partir de la ligne " + (startIdx + 1));
}

const ops = [];
const op = (label, fn) => ops.push({ label, fn });

// ============================================================
// 1. Imports
// ============================================================
op("Import de l'icône Palette", () => {
  const i = findOne("Import des icônes", (s) => s.startsWith("import {") && s.includes('from "lucide-react"') && s.includes("LogIn, Clock }"));
  lines[i] = lines[i].replace("LogIn, Clock }", "LogIn, Clock, Palette }");
  log.push("Import de l'icône Palette");
});

op("Imports des nouveaux composants", () => {
  const i = findOne("Import AdminHealth", (s) => s === 'import AdminHealth from "@/components/AdminHealth";');
  insertAfter("Imports des nouveaux composants", i, String.raw`
import AdminFamilies, { useFamilies, FamilyBadge } from "@/components/AdminFamilies";
import AdminBanners from "@/components/AdminBanners";
import { isoToParisLocal } from "@/lib/parisTime";
import { legacyFamilyText, validateDominantColors, cleanDominantColors, DOMINANT_MAX, DOMINANT_NAME_MAX } from "@/lib/families";
import { promoCodeStatus, validatePromoDates, formatParis } from "@/lib/banners";
`);
});

// ============================================================
// 2. Valeurs de départ et constantes
// ============================================================
op("Collection vide : famille par identifiant", () => {
  const i = findOne("emptyProduct.family", (s) => s === 'family: "Collection Bleus",');
  replaceLines("Collection vide : famille par identifiant", i, i, String.raw`
family_id: null,
neighbour_family_id: null,
`);
});

op("Collection vide : couleurs dominantes à la place de la composition", () => {
  const i = findOne("emptyProduct.crystals", (s) => s === "crystals: [],");
  replaceLines("Collection vide : couleurs dominantes à la place de la composition", i, i, "dominant_colors: [],");
});

op("Code promo vide : dates", () => {
  const i = findOne("emptyPromo.label", (s) => s === 'label: "",');
  insertAfter("Code promo vide : dates", i, String.raw`
starts_at: "",
ends_at: "",
`);
});

op("Liste des familles écrite en dur supprimée", () => {
  const i = findOne("const FAMILIES", (s) => s.startsWith('const FAMILIES = ["Collection Bleus"'));
  replaceLines("Liste des familles écrite en dur supprimée", i, i, "// Les familles (saisons) viennent de la base de données : onglet Familles, liste lue par useFamilies().");
});

op("Icône de l'onglet Familles", () => {
  const i = findOne("TAB_ICONS.collections", (s) => s === "collections: Package,");
  insertAfter("Icône de l'onglet Familles", i, "familles: Palette,");
});

// ============================================================
// 3. Données et fonctions du composant
// ============================================================
op("Chargement des familles", () => {
  const i = findOne("useQuotaStatus", (s) => s === "const quota = useQuotaStatus(isAdmin === true);");
  insertAfter("Chargement des familles", i, String.raw`
// Familles (saisons) : lues dans la base, utilisées par la fiche collection, le tableau et l'onglet Familles
const familiesStatus = useFamilies(isAdmin === true);
const familyById = (id) => familiesStatus.families.find((f) => String(f.id) === String(id)) || null;
`);
});

op("Ouverture d'une collection : couleurs dominantes", () => {
  const i = findOne("openEditProduct.crystals", (s) => s === "crystals: Array.isArray(p.crystals) ? p.crystals : [],");
  replaceLines("Ouverture d'une collection : couleurs dominantes", i, i, "dominant_colors: Array.isArray(p.dominant_colors) ? p.dominant_colors : [],");
});

op("Gestion des couleurs dominantes (remplace celle de la composition)", () => {
  const a = findOne("addCrystalRow", (s) => s.startsWith("const addCrystalRow = () =>"));
  const r = findAfter("removeCrystalRow", a, (s) => s.startsWith("const removeCrystalRow = (idx) =>"));
  const b = findAfter("fin de removeCrystalRow", r, (s) => s === "};");
  const removed = lines.slice(a, b + 1).join("\n");
  if (!removed.includes("updateCrystalRow") || !removed.includes("addCrystalRow") || !removed.includes("removeCrystalRow")) {
    throw new Error("les trois fonctions de la composition ne sont pas consécutives comme prévu (lignes " + (a + 1) + " à " + (b + 1) + ").");
  }
  replaceLines("Gestion des couleurs dominantes (remplace celle de la composition)", a, b, String.raw`
// --- Couleurs dominantes de la bague (0 à 3) : lues par le quiz couleurs ---
const addDominantColor = () => {
  setProductForm((f) => (f.dominant_colors.length >= DOMINANT_MAX ? f : { ...f, dominant_colors: [...f.dominant_colors, { name: "", hex: "#a0764f" }] }));
};
const updateDominantColor = (idx, field, value) => {
  setProductForm((f) => ({ ...f, dominant_colors: f.dominant_colors.map((c, i) => (i === idx ? { ...c, [field]: value } : c)) }));
};
const removeDominantColor = (idx) => {
  setProductForm((f) => ({ ...f, dominant_colors: f.dominant_colors.filter((_, i) => i !== idx) }));
};
`);
});

// ============================================================
// 4. Enregistrement d'une collection
// ============================================================
op("Enregistrement : contrôles famille et couleurs", () => {
  const s = findOne("saveProduct", (x) => x.startsWith("const saveProduct = async"));
  const p = findAfter("saveProduct > payload", s, (x) => x === "const payload = {");
  insertBefore("Enregistrement : contrôles famille et couleurs", p, String.raw`
const colorError = validateDominantColors(productForm.dominant_colors);
if (colorError) {
  setFormError(colorError);
  return;
}
const chosenFamily = familyById(productForm.family_id);
if (!chosenFamily) {
  setFormError("Choisissez une famille pour cette collection.");
  return;
}
if (productForm.neighbour_family_id && String(productForm.neighbour_family_id) === String(productForm.family_id)) {
  setFormError("La saison voisine doit être différente de la famille de la collection.");
  return;
}
`);
});

op("Enregistrement : famille, saison voisine", () => {
  const i = findOne("payload.family", (s) => s === "family: productForm.family,");
  replaceLines("Enregistrement : famille, saison voisine", i, i, String.raw`
family_id: Number(productForm.family_id),
neighbour_family_id: productForm.neighbour_family_id ? Number(productForm.neighbour_family_id) : null,
// L'ancien libellé (« Collection Bleus »...) n'est écrit qu'à la création, la colonne étant obligatoire : le site actuel le lit encore, et une collection existante garde le sien.
...(productForm.id ? {} : { family: legacyFamilyText(chosenFamily.name) }),
`);
});

op("Enregistrement : couleurs dominantes à la place de la composition", () => {
  const i = findOne("payload.crystals", (s) => s === "crystals: productForm.crystals.filter((c) => c.color && c.count > 0),");
  replaceLines("Enregistrement : couleurs dominantes à la place de la composition", i, i, "dominant_colors: cleanDominantColors(productForm.dominant_colors),");
});

// ============================================================
// 5. Tableau des collections
// ============================================================
op("Tableau : famille lue dans la base", () => {
  const i = findOne("cellule Famille", (s) => s.startsWith("<td") && s.includes('{p.family.replace("Collection ", "")}'));
  replaceLines("Tableau : famille lue dans la base", i, i, String.raw`
<td className="px-4 py-3 hidden md:table-cell text-[#54434c]">
  <FamilyBadge family={familyById(p.family_id)} loading={familiesStatus.loading} />
</td>
`);
});

// ============================================================
// 6. Formulaire d'une collection
// ============================================================
op("Formulaire : libellé « Famille (saison) »", () => {
  const i = findOne("libellé Famille", (s) => s === '<span className="text-xs text-[#8b737e]">Famille</span>');
  replaceLines("Formulaire : libellé « Famille (saison) »", i, i, '<span className="text-xs text-[#8b737e]">Famille (saison)</span>');
});

op("Formulaire : liste des familles lue dans la base", () => {
  const a = findOne("select Famille", (s) => s.startsWith("<select value={productForm.family}"));
  const b = findAfter("fin du select Famille", a, (s) => s === "</select>");
  const removed = lines.slice(a, b + 1).join("\n");
  if (!removed.includes("FAMILIES.map")) throw new Error("le menu « Famille » ne contient pas la liste attendue (lignes " + (a + 1) + " à " + (b + 1) + ").");
  replaceLines("Formulaire : liste des familles lue dans la base", a, b, String.raw`
<select
  required
  value={productForm.family_id ?? ""}
  onChange={(e) => {
    const id = e.target.value ? Number(e.target.value) : null;
    setProductForm({
      ...productForm,
      family_id: id,
      neighbour_family_id: id && String(productForm.neighbour_family_id) === String(id) ? null : productForm.neighbour_family_id,
    });
  }}
  className="mt-1 w-full rounded-xl border border-[#eadfe4] px-3 h-10 outline-none focus:border-[#8f6075] bg-white"
>
  <option value="">Choisir une famille…</option>
  {familiesStatus.families.map((f) => (
    <option key={f.id} value={f.id}>
      {f.name}
      {f.active ? "" : " (masquée)"}
    </option>
  ))}
</select>
{familiesStatus.error && <span className="text-[11px] text-red-600">{familiesStatus.error}</span>}
`);
});

op("Formulaire : saison voisine", () => {
  const e = findOne("champ énergie", (s) => s.includes("Phrase d&apos;énergie (sous-titre affiché sur la fiche)"));
  const close = findAfter("fin du champ énergie", e, (s) => s === "</label>");
  insertAfter("Formulaire : saison voisine", close, String.raw`
<label className="text-sm sm:col-span-2">
  <span className="text-xs text-[#8b737e]">Saison voisine (facultatif)</span>
  <select
    value={productForm.neighbour_family_id ?? ""}
    onChange={(e) => setProductForm({ ...productForm, neighbour_family_id: e.target.value ? Number(e.target.value) : null })}
    className="mt-1 w-full rounded-xl border border-[#eadfe4] px-3 h-10 outline-none focus:border-[#8f6075] bg-white"
  >
    <option value="">Aucune</option>
    {familiesStatus.families
      .filter((f) => f.is_season && String(f.id) !== String(productForm.family_id))
      .map((f) => (
        <option key={f.id} value={f.id}>
          {f.name}
        </option>
      ))}
  </select>
  <span className="text-[11px] text-[#8b737e]">Le quiz couleurs peut proposer cette collection aux profils voisins de sa saison.</span>
</label>
`);
});

op("Formulaire : couleurs dominantes à la place de la composition en cristaux", () => {
  const c = findOne("Composition en cristaux", (s) => s.includes("Composition en cristaux"));
  const start = findBefore("début du bloc Composition", c, (s) => s === '<div className="sm:col-span-2">');
  const end = closingDivOf(start);
  if (end < c) throw new Error("le bloc « Composition en cristaux » n'est pas délimité comme prévu.");
  const removed = lines.slice(start, end + 1).join("\n");
  if (!removed.includes("addCrystalRow") || !removed.includes("removeCrystalRow")) throw new Error("le bloc trouvé ne contient pas les boutons de la composition (lignes " + (start + 1) + " à " + (end + 1) + ").");
  replaceLines("Formulaire : couleurs dominantes à la place de la composition en cristaux", start, end, String.raw`
<div className="sm:col-span-2">
  <div className="flex items-center justify-between mb-2">
    <span className="text-xs text-[#8b737e]">Couleurs dominantes de la bague (0 à 3)</span>
    {productForm.dominant_colors.length < DOMINANT_MAX && (
      <button type="button" onClick={addDominantColor} className="text-xs text-[#8f6075] underline">+ Ajouter une couleur</button>
    )}
  </div>
  {productForm.dominant_colors.length === 0 && (
    <p className="text-xs text-[#8b737e] italic">Aucune couleur dominante renseignée pour le moment.</p>
  )}
  <div className="space-y-2">
    {productForm.dominant_colors.map((c, idx) => (
      <div key={idx} className="flex gap-2 items-center">
        <input value={c.name} maxLength={DOMINANT_NAME_MAX} onChange={(e) => updateDominantColor(idx, "name", e.target.value)} placeholder="Nom (ex. Brun doré)"
          className="flex-1 min-w-0 rounded-lg border border-[#eadfe4] px-2.5 h-9 text-sm outline-none focus:border-[#8f6075]" />
        <input type="color" value={c.hex || "#a0764f"} onChange={(e) => updateDominantColor(idx, "hex", e.target.value)} aria-label="Couleur"
          className="h-9 w-9 rounded-lg border border-[#eadfe4]" />
        <button type="button" onClick={() => removeDominantColor(idx)} aria-label="Retirer cette couleur"
          className="h-9 w-9 shrink-0 grid place-items-center rounded-full hover:bg-[#f0e6ea] text-[#9a7384]">
          <Trash2 size={15} />
        </button>
      </div>
    ))}
  </div>
  <p className="text-[11px] text-[#8b737e] mt-1.5">
    Le quiz couleurs s&apos;en sert pour expliquer pourquoi une bague va à une cliente (par exemple : ce brun chocolat rappelle vos cheveux).
  </p>
</div>
`);
});

// ============================================================
// 7. Codes promo : dates et statut
// ============================================================
op("Codes promo : colonne Période (en-tête)", () => {
  const i = findOne("en-tête Avantage", (s) => s === '<th className="px-4 py-3 font-medium">Avantage</th>');
  insertAfter("Codes promo : colonne Période (en-tête)", i, '<th className="px-4 py-3 font-medium">Période</th>');
});

op("Codes promo : colonne Période (cellule)", () => {
  const i = findOne("cellule libellé du code", (s) => s === '<td className="px-4 py-3 text-[#54434c]">{p.label}</td>');
  insertAfter("Codes promo : colonne Période (cellule)", i, String.raw`
<td className="px-4 py-3 text-xs text-[#54434c]">
  {p.starts_at || p.ends_at ? (
    <>
      <span className="whitespace-nowrap">{p.starts_at ? formatParis(p.starts_at) : "dès maintenant"}</span>
      <span className="text-[#b0a3a9]"> → </span>
      <span className="whitespace-nowrap">{p.ends_at ? formatParis(p.ends_at) : "sans fin"}</span>
    </>
  ) : (
    <span className="text-[#8b737e]">Sans limite de dates</span>
  )}
</td>
`);
});

op("Codes promo : statut selon les dates", () => {
  const a = findOne("pastille de statut du code", (s) => s.startsWith("<span className={`rounded-full px-3 py-1 text-xs ${p.active"));
  if (!t(a + 1).includes('"Actif" : "Inactif"') || t(a + 2) !== "</span>") throw new Error("la pastille de statut du code n'a pas la forme attendue (ligne " + (a + 1) + ").");
  replaceLines("Codes promo : statut selon les dates", a, a + 2, String.raw`
<span className={"rounded-full px-3 py-1 text-xs " + promoCodeStatus(p, Date.now()).style}>
  {promoCodeStatus(p, Date.now()).label}
</span>
`);
});

op("Code promo (ouverture) : dates en heure de Paris", () => {
  const i = findOne("openEditPromo", (s) => s === "setPromoForm({ ...p });");
  replaceLines("Code promo (ouverture) : dates en heure de Paris", i, i, "setPromoForm({ ...p, starts_at: isoToParisLocal(p.starts_at), ends_at: isoToParisLocal(p.ends_at) });");
});

op("Code promo (formulaire) : champs de dates", () => {
  const act = findOne("Code actif", (s) => s === "<span>Code actif</span>");
  const label = findBefore("label Code actif", act, (s) => s.startsWith('<label className="flex items-center gap-2 text-sm">'));
  insertBefore("Code promo (formulaire) : champs de dates", label, String.raw`
<div className="grid grid-cols-2 gap-3">
  <label className="text-sm block">
    <span className="text-xs text-[#8b737e]">Valable à partir du (facultatif)</span>
    <input type="datetime-local" value={promoForm.starts_at || ""} onChange={(e) => setPromoForm({ ...promoForm, starts_at: e.target.value })}
      className="mt-1 w-full rounded-xl border border-[#eadfe4] px-3 h-10 text-sm outline-none focus:border-[#8f6075]" />
  </label>
  <label className="text-sm block">
    <span className="text-xs text-[#8b737e]">Jusqu&apos;au (facultatif)</span>
    <input type="datetime-local" value={promoForm.ends_at || ""} onChange={(e) => setPromoForm({ ...promoForm, ends_at: e.target.value })}
      className="mt-1 w-full rounded-xl border border-[#eadfe4] px-3 h-10 text-sm outline-none focus:border-[#8f6075]" />
  </label>
</div>
<p className="text-[11px] text-[#8b737e] -mt-2">Heure de Paris. Sans dates, le code est valable en permanence ; hors période, la boutique ne l&apos;accepte plus.</p>
`);
});

op("Code promo (enregistrement) : contrôle des dates", () => {
  const s = findOne("savePromo", (x) => x.startsWith("const savePromo = async"));
  const p = findAfter("savePromo > payload", s, (x) => x === "const payload = {");
  insertBefore("Code promo (enregistrement) : contrôle des dates", p, String.raw`
const dates = validatePromoDates(promoForm.starts_at, promoForm.ends_at);
if (dates.error) {
  setFormError(dates.error);
  return;
}
`);
});

op("Code promo (enregistrement) : dates envoyées", () => {
  const i = findOne("payload.label (code promo)", (s) => s === "label: promoForm.label.trim(),");
  insertAfter("Code promo (enregistrement) : dates envoyées", i, String.raw`
starts_at: dates.startsAt,
ends_at: dates.endsAt,
`);
});

op("Code promo renommé : les bandeaux suivent", () => {
  const s = findOne("savePromo", (x) => x.startsWith("const savePromo = async"));
  const sp = findAfter("savePromo > setSaving(false)", s, (x) => x === "setSaving(false);");
  insertAfter("Code promo renommé : les bandeaux suivent", sp, String.raw`
if (isRename && !result.error) {
  // Les bandeaux qui utilisaient l'ancien nom du code suivent le renommage
  try {
    await supabase.from("banners").update({ code: payload.code }).eq("code", promoForm.originalCode);
  } catch (err) {
    // table des bandeaux absente : rien à mettre à jour
  }
}
`);
});

op("Code promo supprimé : avertissement si un bandeau l'utilise", () => {
  const i = findOne("confirmation de suppression du code", (s) => s.startsWith("if (!window.confirm(`Supprimer le code"));
  replaceLines("Code promo supprimé : avertissement si un bandeau l'utilise", i, i, String.raw`
let usedBy = 0;
try {
  const { count } = await supabase.from("banners").select("id", { count: "exact", head: true }).eq("code", p.code);
  usedBy = count || 0;
} catch (err) {
  usedBy = 0;
}
const warning = usedBy > 0 ? " Attention : " + usedBy + " bandeau(x) utilise(nt) ce code." : "";
if (!window.confirm("Supprimer le code « " + p.code + " » ?" + warning)) return;
`);
});

// ============================================================
// 8. Contenu des onglets
// ============================================================
op("Onglets Familles et Bandeaux", () => {
  const i = findOne("onglet Connexions", (s) => s === '{tab === "connexions" && <AdminConnections />}');
  insertBefore("Onglets Familles et Bandeaux", i, String.raw`
{tab === "familles" && <AdminFamilies status={familiesStatus} products={products} onProductsChanged={loadProducts} />}
{tab === "promos" && <AdminBanners promoCodes={promoCodes} onCodesChanged={loadPromoCodes} siteMode={maintenanceActive && maintenance.row ? maintenance.row.mode : "off"} />}
`);
});

// ============================================================
// Exécution : tout est appliqué sur une COPIE ; le fichier n'est écrit que si chaque étape a réussi
// ============================================================
const original = lines.slice();
const problems = [];
for (const o of ops) {
  try {
    o.fn();
  } catch (e) {
    problems.push("• " + o.label + " : " + e.message);
  }
}
if (problems.length) {
  lines = original;
  console.error("\n✗ " + problems.length + " modification(s) impossible(s) :\n");
  problems.forEach((p) => console.error("  " + p));
  console.error("\n  Votre admin.js ne correspond pas exactement à la version attendue. Aucun fichier n'a été modifié.");
  console.error("  Envoyez ce message (et la version actuelle de pages/admin.js) pour que le script soit adapté.");
  process.exit(1);
}

// Contrôles finaux
const after = lines.join("\n");
const mustHave = ["useFamilies", "AdminFamilies", "AdminBanners", "familiesStatus.families", "dominant_colors", "promoCodeStatus", "validatePromoDates", "legacyFamilyText"];
const mustNotHave = ["FAMILIES.map", "addCrystalRow", "updateCrystalRow", "removeCrystalRow", "Composition en cristaux", "p.family.replace", "productForm.crystals", "productForm.family,"];
const missing = mustHave.filter((x) => !after.includes(x));
const left = mustNotHave.filter((x) => after.includes(x));
if (missing.length || left.length) {
  console.error("\n✗ Contrôle final : éléments absents [" + missing.join(", ") + "] ou restants [" + left.join(", ") + "].");
  console.error("  Aucun fichier n'a été modifié.");
  process.exit(1);
}

// Équilibre des accolades, parenthèses et crochets (contrôle grossier, hors chaînes et commentaires)
function balance(src) {
  const stack = [];
  const pairs = { ")": "(", "]": "[", "}": "{" };
  let i = 0;
  let line = 1;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === "\n") line++;
    if (c === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === "/" && src[i + 1] === "*") { i += 2; while (i < n && !(src[i] === "*" && src[i + 1] === "/")) { if (src[i] === "\n") line++; i++; } i += 2; continue; }
    if (c === '"' || c === "'") { const q = c; i++; while (i < n && src[i] !== q && src[i] !== "\n") { if (src[i] === "\\") i++; i++; } i++; continue; }
    if (c === "`") { i++; let depth = 0; while (i < n) { if (src[i] === "\\") { i += 2; continue; } if (src[i] === "`" && depth === 0) break; if (src[i] === "$" && src[i + 1] === "{") { depth++; i += 2; continue; } if (src[i] === "}" && depth > 0) depth--; if (src[i] === "\n") line++; i++; } i++; continue; }
    if ("([{".includes(c)) stack.push([c, line]);
    else if (")]}".includes(c)) { const top = stack.pop(); if (!top || top[0] !== pairs[c]) return "« " + c + " » inattendu à la ligne " + line; }
    i++;
  }
  return stack.length ? "« " + stack[stack.length - 1][0] + " » non refermé (ligne " + stack[stack.length - 1][1] + ")" : "";
}
// Contrôle par différence : si le fichier d'origine passe ce contrôle grossier mais pas le fichier modifié, on s'arrête
const unbalancedBefore = balance(original.join("\n"));
const unbalanced = balance(after);
if (!unbalancedBefore && unbalanced) {
  console.error("\n✗ Contrôle final : " + unbalanced + ". Aucun fichier n'a été modifié.");
  process.exit(1);
}

const added = lines.length - original.length;
console.log("\n" + (checkOnly ? "✓ Vérification réussie : " : "✓ ") + ops.length + " modifications prêtes pour " + target + " (" + (added >= 0 ? "+" : "") + added + " lignes).");
log.forEach((l, i) => console.log("  " + String(i + 1).padStart(2, " ") + ". " + l));

if (checkOnly) {
  console.log("\nMode vérification : aucun fichier n'a été modifié. Relancez sans --verifier pour appliquer.");
  process.exit(0);
}

// Copie de sauvegarde, puis écriture (mêmes sauts de ligne et même BOM que l'original)
const backupDir = path.join(path.dirname(path.dirname(path.resolve(target))), "scripts");
fs.mkdirSync(backupDir, { recursive: true });
let backup = path.join(backupDir, "admin.js.avant-saisons.bak");
if (fs.existsSync(backup)) backup = path.join(backupDir, "admin.js.avant-saisons." + Date.now() + ".bak");
fs.writeFileSync(backup, rawText);
fs.writeFileSync(target, (hasBom ? "\uFEFF" : "") + lines.join(eol) + (endsWithEol ? eol : ""));
console.log("\nCopie de sauvegarde : " + path.relative(process.cwd(), backup));
console.log("Fichier modifié     : " + target);
console.log("\nÉtape suivante : npm run build (doit réussir), puis npm run dev.");
console.log("Pour annuler : copiez la sauvegarde par-dessus pages/admin.js, ou lancez git restore pages/admin.js.");
