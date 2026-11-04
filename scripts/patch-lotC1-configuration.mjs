// patch-lotC1-configuration.mjs
// Lot C1 : onglet « Configuration » dans le groupe Accueil, en LECTURE SEULE. Sans SQL.
//
//   - crée lib/configOverview.js        (lecture de site_settings + mise en forme de chaque réglage, fonctions pures testables)
//   - crée components/AdminConfig.js    (cartes par thème : Paiement, Facturation et TVA, Livraison, Animations, Avis, Contact,
//                                        Maintenance, Contenus ; état coloré ; lien « Modifier » vers l'écran existant)
//   - lib/adminNav.js                   : second onglet « Configuration » dans le groupe Accueil
//   - pages/admin.js                    : icône, import et rendu de l'onglet
//
// Rien n'est écrit en base : aucun interrupteur dans ce lot (ils arrivent aux lots C2 et C3, après le journal C5).
// Un réglage absent ou illisible s'affiche « Non défini » : aucune valeur n'est inventée.
// La maintenance est lue dans le hook useMaintenanceStatus déjà chargé par pages/admin.js (table site_maintenance).
//
// Prérequis : lot 5d (ZENORIA_HOME_5D_V1 dans lib/adminNav.js et pages/admin.js).
//
// Usage :  node scripts/patch-lotC1-configuration.mjs --dry-run
//          node scripts/patch-lotC1-configuration.mjs --apply
// Marqueur : ZENORIA_CONFIG_C1_V1 (le script est idempotent)

import fs from "node:fs";
import path from "node:path";

const MARK = "ZENORIA_CONFIG_C1_V1";
const ROOT = process.cwd();
const F_NAV = path.join(ROOT, "lib", "adminNav.js");
const F_ADMIN = path.join(ROOT, "pages", "admin.js");
const F_LIB = path.join(ROOT, "lib", "configOverview.js");
const F_COMP = path.join(ROOT, "components", "AdminConfig.js");
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const dry = args.includes("--dry-run");

if (apply === dry) {
  console.error("Usage : node scripts/patch-lotC1-configuration.mjs --dry-run | --apply");
  process.exit(1);
}
console.log("Mode : " + (apply ? "APPLY (ecriture)" : "DRY-RUN (aucune ecriture)"));

function fail(msg) {
  console.error("ECHEC : " + msg);
  console.error("Aucune modification n'a ete ecrite.");
  process.exit(1);
}

for (const f of [F_NAV, F_ADMIN]) {
  if (!fs.existsSync(f)) fail(path.relative(ROOT, f) + " introuvable (lancez le script depuis la racine du projet).");
}

function readSrc(file) {
  const raw = fs.readFileSync(file, "utf8");
  const bom = raw.charCodeAt(0) === 0xfeff;
  return { bom, crlf: raw.includes("\r\n"), src: (bom ? raw.slice(1) : raw).replace(/\r\n/g, "\n") };
}
function occurrences(str, sub) {
  let n = 0;
  let i = str.indexOf(sub);
  while (i >= 0) {
    n += 1;
    i = str.indexOf(sub, i + sub.length);
  }
  return n;
}
function serialize(doc) {
  return (doc.bom ? "\uFEFF" : "") + (doc.crlf ? doc.src.replace(/\n/g, "\r\n") : doc.src);
}
// Affiche, avec les espaces rendus visibles, les lignes reelles autour d'un repere (aide au diagnostic)
function showContext(doc, hints) {
  const lines = doc.src.split("\n");
  for (const hint of hints || []) {
    const at = lines.findIndex((l) => l.includes(hint));
    if (at < 0) {
      console.error("  Repere « " + hint + " » : introuvable.");
      continue;
    }
    console.error("  Repere « " + hint + " » trouve ligne " + (at + 1) + " :");
    for (let i = Math.max(0, at - 1); i <= Math.min(lines.length - 1, at + 1); i += 1) {
      console.error("    " + (i + 1) + " | " + JSON.stringify(lines[i]));
    }
  }
}
function replaceRegexOnce(doc, re, replacement, label, hints) {
  const n = (doc.src.match(new RegExp(re.source, "g")) || []).length;
  if (n !== 1) {
    if (n === 0) showContext(doc, hints);
    fail(label + " : " + n + " occurrence(s) trouvee(s) au lieu de 1.");
  }
  doc.src = doc.src.replace(re, (...m) => (typeof replacement === "function" ? replacement(...m) : replacement));
}
// Ajoute des lignes juste apres la ligne qui contient le morceau unique
function afterLine(doc, needle, addition, label, hints) {
  const n = occurrences(doc.src, needle);
  if (n !== 1) {
    if (n === 0) showContext(doc, hints || [needle]);
    fail(label + " : " + n + " occurrence(s) trouvee(s) au lieu de 1.");
  }
  const idx = doc.src.indexOf(needle);
  const eol = doc.src.indexOf("\n", idx);
  const end = eol < 0 ? doc.src.length : eol;
  doc.src = doc.src.slice(0, end) + "\n" + addition + doc.src.slice(end);
}

const nav = readSrc(F_NAV);
const admin = readSrc(F_ADMIN);

if (nav.src.includes(MARK) && admin.src.includes(MARK) && fs.existsSync(F_LIB) && fs.existsSync(F_COMP)) {
  console.log("Deja applique (" + MARK + " present). Rien a faire.");
  process.exit(0);
}
if (nav.src.includes(MARK) || admin.src.includes(MARK)) fail("Etat incoherent : le marqueur n'est present que dans une partie des fichiers. Restaurez-les (git checkout) puis relancez.");
if (fs.existsSync(F_LIB) || fs.existsSync(F_COMP)) fail("lib/configOverview.js ou components/AdminConfig.js existe deja sans que les fichiers soient patches.");
for (const [d, n] of [[nav, "lib/adminNav.js"], [admin, "pages/admin.js"]]) {
  if (!d.src.includes("ZENORIA_HOME_5D_V1")) fail(n + " ne contient pas ZENORIA_HOME_5D_V1 : le lot 5d doit etre applique avant.");
  console.log(n + " (fins de ligne " + (d.crlf ? "Windows CRLF" : "LF") + ")");
}
const before = { nav: nav.src.split("\n").length, admin: admin.src.split("\n").length };

// ------------------------------------------------------------------
// Nouveaux fichiers
// ------------------------------------------------------------------
const LIB = String.raw`// ZENORIA_CONFIG_C1_V1 : état de configuration du site, en LECTURE SEULE (Accueil › Configuration).
// Les réglages sont lus dans site_settings (une clé, une valeur JSON). Rien n'est écrit ici : chaque réglage se modifie
// sur son écran habituel. Un réglage absent ou illisible s'affiche « Non défini » : on n'invente jamais de valeur.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { parseSeasonFxSetting, FX_SEASON_NAMES } from "@/lib/siteSettings";

// Réglages dont on lit la valeur
export const CONFIG_KEYS = ["payment_methods", "bank_transfer", "billing", "shipping", "season_fx", "ring_animation", "reviews", "contact"];
// Textes volumineux : seule la date de dernière modification est lue
export const CONFIG_META_KEYS = ["site_texts", "cgv_text"];

function obj(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : null;
}
function flag(v) {
  return v === true ? true : v === false ? false : null;
}
function str(v) {
  return typeof v === "string" ? v.trim() : "";
}
function int(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}
function plural(n) {
  return n + (n > 1 ? " jours" : " jour");
}

export function formatMoney(n) {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}
export function formatWhen(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" });
}
// L'IBAN est affiché partiellement : début et fin seulement (il se lit en entier dans Moyens de paiement)
export function maskIban(value) {
  const compact = str(value).replace(/\s+/g, "");
  if (!compact) return "";
  if (compact.length <= 8) return compact;
  return compact.slice(0, 4) + " •••• " + compact.slice(-4);
}

const RING_MODES = { once: "Une fois" };
const RING_SPEEDS = { slow: "lente" };
const RING_HEART = { ring: "couleur de la bague" };
const REVIEW_MODES = { full: "Complet (notes et textes)", stars: "Étoiles seules" };

// Construit les cartes à afficher. Entrées :
//   rows        : { clé: { value, updated_at, ... } }  (site_settings)
//   meta        : { clé: { updated_at } } pour site_texts et cgv_text, ou null si la lecture a échoué
//   maintenance : { loading, error, row, active }      (hook useMaintenanceStatus de pages/admin.js)
// Chaque ligne : { id, label, sub?, flag? (true | false | null) ou text, tone?, missing? }
export function buildConfigOverview(input) {
  const rows = (input && input.rows) || {};
  const meta = input ? input.meta : null;
  const mt = (input && input.maintenance) || {};
  const val = (key) => (rows[key] ? obj(rows[key].value) : null);

  const pm = val("payment_methods");
  const bt = val("bank_transfer");
  const bl = val("billing");
  const sh = val("shipping");
  const ra = val("ring_animation");
  const rv = val("reviews");
  const ct = val("contact");

  const textItem = (id, label, value, opts) => {
    const o = opts || {};
    const t = typeof value === "string" ? value : "";
    if (t) return { id, label, text: t, sub: o.sub, tone: o.tone, missing: false };
    if (o.dash) return { id, label, text: "—", sub: o.sub, missing: false };
    return { id, label, text: "Non défini", sub: o.sub, missing: true };
  };

  // ---- Paiement ----
  const delay = bt ? int(bt.delay_days) : null;
  const grace = bt ? int(bt.grace_days) : null;
  const delaysText = bt ? (delay === null ? "délai non défini" : plural(delay)) + " / " + (grace === null ? "2 jours (défaut)" : plural(grace)) : "";
  const payment = [
    { id: "stripe", label: "Carte bancaire (Stripe)", flag: pm ? flag(pm.stripe_enabled) : null },
    { id: "transfer", label: "Virement bancaire", flag: pm ? flag(pm.transfer_enabled) : null },
    textItem("delays", "Délai de paiement / de grâce", delaysText),
    textItem("beneficiary", "Bénéficiaire", bt ? str(bt.beneficiary) : ""),
    textItem("iban", "IBAN (partiel)", bt ? maskIban(bt.iban) : "", {}),
  ];

  // ---- Facturation ----
  const vatRate = bl ? int(bl.vat_rate) : null;
  const billing = [
    { id: "vat", label: "Assujettie à la TVA", flag: bl ? flag(bl.vat_enabled) : null, sub: vatRate === null ? undefined : "Taux enregistré : " + vatRate + " %" },
    textItem("seller_name", "Nom du vendeur", bl ? str(bl.seller_name) : ""),
    textItem("siret", "SIRET", bl ? str(bl.seller_siret) : ""),
    textItem("address", "Adresse", bl ? str(bl.seller_address) : ""),
    textItem("vat_number", "N° de TVA intracommunautaire", bl ? str(bl.seller_vat_number) : "", { dash: true }),
  ];

  // ---- Livraison ----
  const threshold = sh ? int(sh.threshold) : null;
  const fee = sh ? int(sh.fee) : null;
  const shipping = [
    { id: "free_shipping", label: "Livraison offerte", flag: sh ? flag(sh.enabled) : null, sub: "À partir du seuil, avant code promo" },
    { id: "threshold", label: "Seuil", text: threshold === null ? "Non défini" : formatMoney(threshold), missing: threshold === null },
    { id: "fee", label: "Frais de livraison", text: fee === null ? "Non défini" : formatMoney(fee), missing: fee === null },
  ];

  // ---- Animations ----
  const seasonRow = rows.season_fx ? rows.season_fx.value : null;
  const season = parseSeasonFxSetting(seasonRow);
  const seasonText = !rows.season_fx
    ? "Automatique (par défaut)"
    : season.mode === "off"
    ? "Désactivé"
    : season.mode === "forced"
    ? "Saison forcée : " + (FX_SEASON_NAMES[season.season] || season.season)
    : "Automatique";
  let ringText = "";
  if (ra) {
    const parts = [];
    if (str(ra.mode)) parts.push(RING_MODES[ra.mode] || str(ra.mode));
    if (str(ra.speed)) parts.push("vitesse " + (RING_SPEEDS[ra.speed] || str(ra.speed)));
    if (str(ra.heart_color)) parts.push("cœur : " + (RING_HEART[ra.heart_color] || str(ra.heart_color)));
    ringText = parts.join(" · ");
  }
  const animations = [
    { id: "season_fx", label: "Effet saisonnier", text: seasonText, sub: "Désactivé pour les visiteuses qui limitent les mouvements", missing: false },
    textItem("ring", "Animation « Le geste »", ringText),
  ];

  // ---- Avis ----
  const reviews = [
    { id: "reviews_enabled", label: "Module avis", flag: rv ? flag(rv.enabled) : null, sub: "Dépôt, affichage, charte des avis" },
    textItem("reviews_mode", "Affichage", rv ? REVIEW_MODES[rv.mode] || str(rv.mode) : ""),
  ];

  // ---- Contact ----
  const channel = (key, label) => {
    const c = ct ? obj(ct[key]) : null;
    const value = c ? str(c.value) : "";
    return { id: "contact_" + key, label, flag: c ? flag(c.enabled) : null, sub: value || undefined };
  };
  const contact = [channel("email", "E-mail"), channel("whatsapp", "WhatsApp"), channel("signal", "Signal")];

  // ---- Maintenance ----
  let mText = "Non défini";
  let mTone = "";
  let mSub = "";
  let mMissing = false;
  if (mt.loading) {
    mText = "Chargement…";
    mMissing = true;
  } else if (mt.error) {
    mText = "Non lisible";
    mTone = "warn";
  } else if (!mt.row) {
    mMissing = true;
  } else if (!mt.active) {
    mText = "Ouvert";
    mTone = "ok";
  } else {
    mText = mt.row.mode === "full" ? "Maintenance totale" : "Boutique en pause";
    mTone = mt.row.mode === "full" ? "crit" : "warn";
    mSub = mt.row.auto_end_at ? "Réouverture automatique le " + formatWhen(mt.row.auto_end_at) : "Réouverture manuelle";
  }
  const maintenance = [{ id: "maintenance_state", label: "État du site", text: mText, tone: mTone, sub: mSub || undefined, missing: mMissing }];

  // ---- Contenus ----
  const metaLine = (key, emptyText) => {
    if (meta === null || meta === undefined) return { text: "Non lisible", tone: "warn", missing: false };
    const row = meta[key];
    if (!row) return { text: emptyText, missing: false };
    return { text: "Modifié le " + formatWhen(row.updated_at), missing: false };
  };
  const mTexts = metaLine("site_texts", "Valeurs par défaut");
  const mCgv = metaLine("cgv_text", "Aucun texte enregistré");
  const contents = [
    { id: "site_texts", label: "Textes du site", ...mTexts },
    { id: "cgv_text", label: "CGV", ...mCgv },
  ];

  return [
    { id: "payment", title: "Paiement", keys: "payment_methods · bank_transfer", link: { group: "reglages", tab: "paiement" }, items: payment },
    { id: "billing", title: "Facturation et TVA", keys: "billing — chaque facture est figée à son émission", link: { group: "reglages", tab: "facturation" }, items: billing },
    { id: "shipping", title: "Livraison", keys: "shipping", link: { group: "produits", tab: "site" }, items: shipping },
    { id: "animations", title: "Animations", keys: "season_fx · ring_animation", link: { group: "produits", tab: "site" }, items: animations },
    { id: "reviews", title: "Avis clientes", keys: "reviews", link: { group: "produits", tab: "site" }, items: reviews },
    { id: "contact", title: "Canaux de contact", keys: "contact", link: { group: "produits", tab: "site" }, items: contact },
    { id: "maintenance", title: "Maintenance", keys: "table site_maintenance", link: { group: "technique", tab: "maintenance" }, items: maintenance },
    { id: "contents", title: "Contenus", keys: "site_texts · cgv_text", link: { group: "produits", tab: "site" }, items: contents },
  ];
}

function friendly(err) {
  const msg = err && err.message ? err.message : typeof err === "string" ? err : "";
  return "Les réglages n'ont pas pu être lus" + (msg ? " (" + msg + ")" : "") + ". Cliquez sur « Actualiser ».";
}

// Lit les réglages. Une erreur sur la lecture principale est bloquante ; une erreur sur les dates des textes ne l'est pas.
export async function loadSiteConfig() {
  try {
    const [a, b] = await Promise.all([
      supabase.from("site_settings").select("key, value, updated_at, updated_by_email").in("key", CONFIG_KEYS),
      supabase.from("site_settings").select("key, updated_at").in("key", CONFIG_META_KEYS),
    ]);
    if (a.error || !Array.isArray(a.data)) return { rows: {}, meta: null, error: friendly(a.error) };
    const rows = {};
    a.data.forEach((r) => {
      rows[r.key] = r;
    });
    let meta = null;
    if (!b.error && Array.isArray(b.data)) {
      meta = {};
      b.data.forEach((r) => {
        meta[r.key] = r;
      });
    }
    return { rows, meta, error: "" };
  } catch (e) {
    return { rows: {}, meta: null, error: friendly(e) };
  }
}

export function useSiteConfig() {
  const [state, setState] = useState({ loaded: false, loading: true, error: "", rows: {}, meta: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    loadSiteConfig().then((res) => {
      if (alive) setState({ loaded: true, loading: false, error: res.error, rows: res.rows, meta: res.meta });
    });
    return () => {
      alive = false;
    };
  }, [tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
`;

const COMP = String.raw`// ZENORIA_CONFIG_C1_V1 : onglet Accueil › Configuration (lecture seule).
// Montre l'état de chaque réglage du site, regroupé par thème. Chaque carte renvoie vers l'écran qui permet de le modifier.
import React from "react";
import { RefreshCw } from "lucide-react";
import { isMaintenanceActive } from "@/components/AdminMaintenance";
import { useSiteConfig, buildConfigOverview } from "@/lib/configOverview";

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
                  onClick={() => onGo(s.link.group, s.link.tab)}
                  data-testid={"config-link-" + s.id}
                  className="text-xs text-[#8f6075] underline shrink-0"
                >
                  Modifier ›
                </button>
              </div>
              <div className="text-[11px] text-[#8b737e] mb-1.5">{s.keys}</div>
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
`;

// ------------------------------------------------------------------
// lib/adminNav.js : second onglet dans le groupe Accueil
// ------------------------------------------------------------------
replaceRegexOnce(
  nav,
  /tabs:\s*\[\s*\{\s*id:\s*"tableau",\s*label:\s*"Tableau de bord"\s*\}\s*\],/,
  'tabs: [\n      { id: "tableau", label: "Tableau de bord" },\n      { id: "configuration", label: "Configuration" }, // ' + MARK + " : état des réglages du site (lecture seule)\n    ],",
  "Onglets du groupe Accueil (adminNav.js)",
  ['id: "tableau"', 'label: "Tableau de bord"']
);
// Commentaire d'en-tête (facultatif)
{
  const re = /(\/\/\s+Accueil\s+: Tableau de bord)(?!,)/;
  if (re.test(nav.src)) nav.src = nav.src.replace(re, (m) => m + ", Configuration (" + MARK + ")");
}

// ------------------------------------------------------------------
// pages/admin.js : import, icône, rendu
// ------------------------------------------------------------------
afterLine(
  admin,
  'import AdminHome from "@/components/AdminHome";',
  "// " + MARK + " : onglet Accueil › Configuration (lecture seule)\n" +
    'import AdminConfig from "@/components/AdminConfig";\n' +
    'import { ToggleRight } from "lucide-react";',
  "Import AdminHome (admin.js)"
);
afterLine(admin, "tableau: LayoutDashboard,", "  configuration: ToggleRight, // " + MARK, "Icone de l'onglet tableau (TAB_ICONS)");
afterLine(
  admin,
  "<AdminHome counters={counters} onGo={goTo} onOpenStock={openStock} />",
  '        {tab === "configuration" && <AdminConfig onGo={goTo} maintenance={maintenance} />} {/* ' + MARK + " */}",
  "Rendu de AdminHome (admin.js)"
);

// ------------------------------------------------------------------
// Controles finaux
// ------------------------------------------------------------------
if (occurrences(nav.src, MARK) < 1) fail("adminNav.js : marqueur absent.");
if (occurrences(nav.src, 'id: "configuration"') !== 1) fail("adminNav.js : l'onglet configuration doit apparaitre une seule fois.");
if (occurrences(admin.src, MARK) < 3) fail("admin.js : marqueur attendu au moins 3 fois, trouve " + occurrences(admin.src, MARK) + ".");
if (occurrences(admin.src, "<AdminConfig") !== 1) fail("admin.js : <AdminConfig doit apparaitre une seule fois.");
if (occurrences(admin.src, "configuration: ToggleRight") !== 1) fail("admin.js : l'icone configuration doit apparaitre une seule fois.");

const eol = admin.crlf ? "\r\n" : "\n";
const toEol = (s) => s.replace(/\n/g, eol);
console.log("");
console.log("  1. lib/configOverview.js (nouveau)                         OK");
console.log("  2. components/AdminConfig.js (nouveau)                     OK");
console.log("  3. lib/adminNav.js : onglet « Configuration » (Accueil)    OK");
console.log("  4. pages/admin.js : icone, import, rendu                   OK");
console.log("  Lignes adminNav.js : " + before.nav + " -> " + nav.src.split("\n").length);
console.log("  Lignes admin.js : " + before.admin + " -> " + admin.src.split("\n").length);

if (apply) {
  fs.writeFileSync(F_LIB, toEol(LIB), "utf8");
  fs.writeFileSync(F_COMP, toEol(COMP), "utf8");
  fs.writeFileSync(F_NAV, serialize(nav), "utf8");
  fs.writeFileSync(F_ADMIN, serialize(admin), "utf8");
  console.log("\nEcrit : lib/configOverview.js, components/AdminConfig.js, lib/adminNav.js, pages/admin.js");
  console.log("Prochaine etape : npm run build");
} else {
  console.log("\nDRY-RUN termine : rien n'a ete ecrit. Relancez avec --apply.");
}
