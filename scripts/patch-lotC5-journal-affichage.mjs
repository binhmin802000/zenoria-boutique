// patch-lotC5-journal-affichage.mjs
// Lot C5 (partie interface) : « Historique des changements de réglages » en bas de l'onglet Accueil › Configuration. Lecture seule. Sans SQL.
//
// À appliquer APRÈS avoir exécuté supabase_lotC5_journal_reglages.sql dans Supabase (sinon le bloc affiche un message d'installation).
//
//   - crée lib/configLog.js         (lecture de site_settings_log, mise en forme lisible de chaque changement, hook)
//   - crée components/ConfigLog.js  (tableau : date, réglage, changement, auteur ; bouton Actualiser)
//   - components/AdminConfig.js     : affiche le journal sous les cartes (3 lignes)
//
// Rien n'est écrit : le journal est alimenté par le déclencheur SQL, pas par l'interface.
// Les textes volumineux (textes du site, CGV) n'apparaissent que sous la forme « Texte modifié (N → M caractères) ».
// L'IBAN est déjà masqué dans la base : l'interface n'affiche jamais l'IBAN complet.
//
// Prérequis : lot C1 (ZENORIA_CONFIG_C1_V1 dans components/AdminConfig.js).
//
// Usage :  node scripts/patch-lotC5-journal-affichage.mjs --dry-run
//          node scripts/patch-lotC5-journal-affichage.mjs --apply
// Marqueur : ZENORIA_CONFIG_C5_V1 (le script est idempotent)

import fs from "node:fs";
import path from "node:path";

const MARK = "ZENORIA_CONFIG_C5_V1";
const BASE = "ZENORIA_CONFIG_C1_V1";
const ROOT = process.cwd();
const F_CFG = path.join(ROOT, "components", "AdminConfig.js");
const F_LIB = path.join(ROOT, "lib", "configLog.js");
const F_COMP = path.join(ROOT, "components", "ConfigLog.js");
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const dry = args.includes("--dry-run");

if (apply === dry) {
  console.error("Usage : node scripts/patch-lotC5-journal-affichage.mjs --dry-run | --apply");
  process.exit(1);
}
console.log("Mode : " + (apply ? "APPLY (ecriture)" : "DRY-RUN (aucune ecriture)"));

function fail(msg) {
  console.error("ECHEC : " + msg);
  console.error("Aucune modification n'a ete ecrite.");
  process.exit(1);
}

if (!fs.existsSync(F_CFG)) fail("components/AdminConfig.js introuvable (lancez le script depuis la racine du projet, avec le lot C1 applique).");

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
  const n = (doc.src.match(new RegExp(re.source, "gm")) || []).length;
  if (n !== 1) {
    if (n === 0) showContext(doc, hints);
    fail(label + " : " + n + " occurrence(s) trouvee(s) au lieu de 1.");
  }
  doc.src = doc.src.replace(re, (...m) => (typeof replacement === "function" ? replacement(...m) : replacement));
}

const cfg = readSrc(F_CFG);
if (cfg.src.includes(MARK) && fs.existsSync(F_LIB) && fs.existsSync(F_COMP)) {
  console.log("Deja applique (" + MARK + " present). Rien a faire.");
  process.exit(0);
}
if (cfg.src.includes(MARK)) fail("Etat incoherent : le marqueur est present dans AdminConfig.js mais lib/configLog.js ou components/ConfigLog.js manque. Restaurez AdminConfig.js (git checkout) puis relancez.");
if (fs.existsSync(F_LIB) || fs.existsSync(F_COMP)) fail("lib/configLog.js ou components/ConfigLog.js existe deja sans que AdminConfig.js soit patche.");
if (!cfg.src.includes(BASE)) fail("components/AdminConfig.js ne contient pas " + BASE + " : le lot C1 doit etre applique avant.");
console.log("components/AdminConfig.js (fins de ligne " + (cfg.crlf ? "Windows CRLF" : "LF") + ")");
const before = cfg.src.split("\n").length;

// ------------------------------------------------------------------
// Nouveaux fichiers
// ------------------------------------------------------------------
const LIB = String.raw`// ZENORIA_CONFIG_C5_V1 : lecture et mise en forme du journal des changements de réglages (table site_settings_log).
// Le journal est alimenté par un déclencheur SQL (supabase_lotC5_journal_reglages.sql) : l'interface ne fait que le lire.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export const LOG_LIMIT = 50;

export const LOG_KEY_LABELS = {
  payment_methods: "Moyens de paiement",
  bank_transfer: "Virement bancaire",
  billing: "Facturation et TVA",
  shipping: "Livraison",
  season_fx: "Effet saisonnier",
  ring_animation: "Animation « Le geste »",
  reviews: "Avis clientes",
  contact: "Canaux de contact",
  site_texts: "Textes du site",
  cgv_text: "CGV",
};

export const LOG_FIELD_LABELS = {
  stripe_enabled: "Carte bancaire",
  transfer_enabled: "Virement",
  delay_days: "Délai de paiement",
  grace_days: "Délai de grâce",
  iban: "IBAN",
  bic: "BIC",
  beneficiary: "Bénéficiaire",
  vat_enabled: "TVA",
  vat_rate: "Taux de TVA",
  seller_name: "Nom du vendeur",
  seller_siret: "SIRET",
  seller_address: "Adresse",
  seller_vat_number: "N° de TVA",
  enabled: "Activé",
  fee: "Frais de livraison",
  threshold: "Seuil de livraison offerte",
  mode: "Mode",
  speed: "Vitesse",
  heart_color: "Couleur du cœur",
  season: "Saison",
  email: "E-mail",
  whatsapp: "WhatsApp",
  signal: "Signal",
};

const MAX_LINES = 4;

function money(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return String(n);
  return x.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}
function plural(n, one, many) {
  return n + " " + (n > 1 ? many : one);
}

// Valeur lisible d'un champ. Les canaux de contact sont des objets { value, enabled }.
export function formatLogValue(field, v) {
  if (v === undefined || v === null || v === "") return "—";
  if (typeof v === "boolean") return v ? "activé" : "désactivé";
  if (typeof v === "object" && !Array.isArray(v)) {
    const state = typeof v.enabled === "boolean" ? (v.enabled ? "activé" : "désactivé") : "";
    const val = typeof v.value === "string" && v.value ? v.value : "";
    if (state || val) return [state, val].filter(Boolean).join(" · ");
    return JSON.stringify(v);
  }
  if (field === "fee" || field === "threshold") return money(v);
  if (field === "delay_days" || field === "grace_days") {
    const n = Number(v);
    return Number.isFinite(n) ? plural(n, "jour", "jours") : String(v);
  }
  if (field === "vat_rate") return String(v) + " %";
  return String(v);
}

// Décrit un changement : { key, label, lines: [texte], more, author, when }
export function describeLogEntry(entry) {
  const e = entry || {};
  const label = LOG_KEY_LABELS[e.key] || e.key || "Réglage inconnu";
  const author = e.changed_by_email || "SQL Editor ou non renseigné";
  const out = { id: e.id, key: e.key, label, lines: [], more: 0, author, when: e.changed_at || "" };

  if (e.action === "insert") {
    out.lines.push("Réglage créé");
    return out;
  }
  if (e.action === "delete") {
    out.lines.push("Réglage supprimé");
    return out;
  }
  // Textes volumineux : seules les tailles sont conservées
  if (e.old_size !== null && e.old_size !== undefined && e.new_size !== null && e.new_size !== undefined) {
    out.lines.push("Texte modifié (" + e.old_size + " → " + e.new_size + " caractères)");
    return out;
  }
  const fields = Array.isArray(e.changed_fields) ? e.changed_fields : null;
  const oldV = e.old_value && typeof e.old_value === "object" ? e.old_value : {};
  const newV = e.new_value && typeof e.new_value === "object" ? e.new_value : {};
  if (!fields || fields.length === 0) {
    out.lines.push("Modifié");
    return out;
  }
  const lines = fields.map((f) => {
    const name = LOG_FIELD_LABELS[f] || f;
    const a = formatLogValue(f, oldV[f]);
    const b = formatLogValue(f, newV[f]);
    // L'IBAN est masqué dans le journal : deux IBAN différents peuvent avoir le même aspect
    if (a === b) return name + " : modifié";
    return name + " : " + a + " → " + b;
  });
  out.lines = lines.slice(0, MAX_LINES);
  out.more = Math.max(0, lines.length - MAX_LINES);
  return out;
}

export function formatLogWhen(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" });
}

function friendly(err) {
  const msg = err && err.message ? err.message : typeof err === "string" ? err : "";
  if (/does not exist|schema cache|relation|42P01/i.test(msg)) {
    return "Le journal n'est pas installé. Exécutez supabase_lotC5_journal_reglages.sql dans Supabase (SQL Editor), puis cliquez sur « Actualiser ».";
  }
  return "Le journal n'a pas pu être lu" + (msg ? " (" + msg + ")" : "") + ". Cliquez sur « Actualiser ».";
}

export async function loadSettingsLog(limit) {
  try {
    const res = await supabase.from("site_settings_log").select("*").order("changed_at", { ascending: false }).limit(limit || LOG_LIMIT);
    if (res.error || !Array.isArray(res.data)) return { entries: [], error: friendly(res.error) };
    return { entries: res.data, error: "" };
  } catch (e) {
    return { entries: [], error: friendly(e) };
  }
}

// refreshKey : toute valeur qui change quand l'écran relit ses réglages (le journal est alors relu aussi)
export function useSettingsLog(refreshKey) {
  const [state, setState] = useState({ loaded: false, loading: true, error: "", entries: [] });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    loadSettingsLog().then((res) => {
      if (alive) setState({ loaded: true, loading: false, error: res.error, entries: res.entries });
    });
    return () => {
      alive = false;
    };
  }, [refreshKey, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
`;

const COMP = String.raw`// ZENORIA_CONFIG_C5_V1 : historique des changements de réglages (bas de l'onglet Accueil › Configuration). Lecture seule.
import React from "react";
import { RefreshCw } from "lucide-react";
import { useSettingsLog, describeLogEntry, formatLogWhen, LOG_LIMIT } from "@/lib/configLog";

// Affichage seul (testable sans réseau)
export function ConfigLogView({ entries, loaded, loading, error, onReload }) {
  const rows = (entries || []).map(describeLogEntry);
  return (
    <section className="mt-8" data-testid="config-log">
      <div className="flex justify-between items-center gap-3 mb-2">
        <h2 className="font-serif text-lg">Historique des changements de réglages</h2>
        <button
          type="button"
          onClick={onReload}
          disabled={loading}
          data-testid="config-log-refresh"
          className="flex items-center gap-1.5 rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] px-3 h-9 text-xs disabled:opacity-60"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Actualiser
        </button>
      </div>

      {error ? (
        <div role="alert" data-testid="config-log-error" className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 text-[13px]">
          {error}
        </div>
      ) : null}
      {!loaded && !error ? (
        <p className="text-sm text-[#8b737e]" data-testid="config-log-loading">
          Chargement…
        </p>
      ) : null}

      {loaded && !error ? (
        <>
          <div className="bg-white rounded-2xl border border-[#eee2e5] overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm" data-testid="config-log-table">
              <thead>
                <tr className="bg-[#f5edf1] text-left text-[#8b737e]">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Réglage</th>
                  <th className="px-4 py-3 font-medium">Changement</th>
                  <th className="px-4 py-3 font-medium">Auteur</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-[#8b737e]" data-testid="config-log-empty">
                      Aucun changement enregistré depuis l&apos;installation du journal.
                    </td>
                  </tr>
                ) : null}
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-[#eee2e5] align-top" data-testid="config-log-row">
                    <td className="px-4 py-3 whitespace-nowrap text-[12px] text-[#8b737e]">{formatLogWhen(r.when)}</td>
                    <td className="px-4 py-3 font-medium whitespace-nowrap">{r.label}</td>
                    <td className="px-4 py-3 text-[13px] text-[#54434c]">
                      {r.lines.map((l, i) => (
                        <div key={i}>{l}</div>
                      ))}
                      {r.more > 0 ? <div className="text-[11px] text-[#8b737e]">+ {r.more} autre{r.more > 1 ? "s" : ""}</div> : null}
                    </td>
                    <td className="px-4 py-3 text-[12px] text-[#54434c]">{r.author}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] leading-4 text-[#8b737e] mt-2">
            Les {LOG_LIMIT} derniers changements. Le journal ne contient que les changements faits depuis son installation. Les textes volumineux n&apos;y sont pas copiés
            (seule leur taille est indiquée) et l&apos;IBAN y est masqué. Les changements de maintenance sont enregistrés à part.
          </p>
        </>
      ) : null}
    </section>
  );
}

export default function ConfigLog({ refreshKey }) {
  const log = useSettingsLog(refreshKey);
  return <ConfigLogView entries={log.entries} loaded={log.loaded} loading={log.loading} error={log.error} onReload={log.reload} />;
}
`;

// ------------------------------------------------------------------
// components/AdminConfig.js : import + affichage sous les cartes
// ------------------------------------------------------------------
replaceRegexOnce(
  cfg,
  /^(import \{ useSiteConfig, buildConfigOverview[^\n]*\} from "@\/lib\/configOverview";[^\n]*)$/m,
  (line) => line + "\n// " + MARK + " : historique des changements de réglages\nimport ConfigLog from \"@/components/ConfigLog\";",
  "Import configOverview (AdminConfig.js)",
  ["from \"@/lib/configOverview\""]
);
replaceRegexOnce(
  cfg,
  /return <ConfigView([^;]*?)\/>;/,
  (m, props) =>
    "return (\n    <>\n      <ConfigView" + props.replace(/\s+$/, "") + " />\n      {/* " + MARK + " */}\n      {cfg.loaded && !cfg.error ? <ConfigLog refreshKey={cfg.rows} /> : null}\n    </>\n  );",
  "Rendu de ConfigView (AdminConfig.js)",
  ["return <ConfigView", "ConfigView"]
);

// ------------------------------------------------------------------
// Controles finaux
// ------------------------------------------------------------------
if (occurrences(cfg.src, MARK) < 2) fail("AdminConfig.js : marqueur attendu au moins 2 fois, trouve " + occurrences(cfg.src, MARK) + ".");
if (occurrences(cfg.src, "<ConfigLog ") !== 1) fail("AdminConfig.js : <ConfigLog doit apparaitre une seule fois.");
if (occurrences(cfg.src, "<ConfigView") !== 1) fail("AdminConfig.js : <ConfigView doit apparaitre une seule fois.");

const eol = cfg.crlf ? "\r\n" : "\n";
const toEol = (s) => s.replace(/\n/g, eol);
console.log("");
console.log("  1. lib/configLog.js (nouveau)                                OK");
console.log("  2. components/ConfigLog.js (nouveau)                         OK");
console.log("  3. AdminConfig.js : journal affiche sous les cartes          OK");
console.log("  Lignes AdminConfig.js : " + before + " -> " + cfg.src.split("\n").length);

if (apply) {
  fs.writeFileSync(F_LIB, toEol(LIB), "utf8");
  fs.writeFileSync(F_COMP, toEol(COMP), "utf8");
  fs.writeFileSync(F_CFG, serialize(cfg), "utf8");
  console.log("\nEcrit : lib/configLog.js, components/ConfigLog.js, components/AdminConfig.js");
  console.log("Prochaine etape : npm run build");
} else {
  console.log("\nDRY-RUN termine : rien n'a ete ecrit. Relancez avec --apply.");
}
