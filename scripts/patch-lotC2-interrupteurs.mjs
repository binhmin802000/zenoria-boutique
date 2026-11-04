// patch-lotC2-interrupteurs.mjs
// Lot C2 : interrupteurs SIMPLES dans l'onglet Accueil › Configuration. Sans SQL.
//
//   Livraison offerte   -> site_settings.shipping.enabled
//   Module avis         -> site_settings.reviews.enabled
//   E-mail, WhatsApp, Signal -> site_settings.contact.<canal>.enabled
//
// Règles d'écriture (identiques pour les cinq interrupteurs) :
//   - UN SEUL champ est modifié : la valeur actuelle est relue, le champ visé change, tout le reste est conservé tel quel
//     (seuil, frais de livraison, mode des avis, numéros, adresses). On n'utilise PAS les fonctions build… des écrans existants,
//     qui reconstruisent toute la valeur.
//   - Si le réglage est absent ou illisible, rien n'est écrit (aucune création d'un réglage partiel).
//   - Détection de conflit : l'écriture n'a lieu que si la ligne n'a pas changé depuis son affichage (comparaison sur updated_at).
//     Sinon : message clair et relecture, sans rien écraser.
//   - Chaque changement est enregistré par le journal du lot C5, avec l'e-mail du compte connecté.
//   - Aucune confirmation : ces réglages sont réversibles d'un clic. Les réglages sensibles (carte, virement, TVA, maintenance) sont au lot C3.
//
//   - crée lib/configToggle.js          (règles d'écriture, messages, hook useConfigToggle)
//   - crée components/ConfigSwitch.js   (interrupteur, ou pastille de lecture seule pour les autres réglages)
//   - components/AdminConfig.js         : interrupteurs à la place des pastilles, bandeau de résultat
//
// Prérequis : lots C1 et C5 (ZENORIA_CONFIG_C1_V1 et ZENORIA_CONFIG_C5_V1 dans components/AdminConfig.js).
//
// Usage :  node scripts/patch-lotC2-interrupteurs.mjs --dry-run
//          node scripts/patch-lotC2-interrupteurs.mjs --apply
// Marqueur : ZENORIA_CONFIG_C2_V1 (le script est idempotent)

import fs from "node:fs";
import path from "node:path";

const MARK = "ZENORIA_CONFIG_C2_V1";
const ROOT = process.cwd();
const F_CFG = path.join(ROOT, "components", "AdminConfig.js");
const F_LIB = path.join(ROOT, "lib", "configToggle.js");
const F_COMP = path.join(ROOT, "components", "ConfigSwitch.js");
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const dry = args.includes("--dry-run");

if (apply === dry) {
  console.error("Usage : node scripts/patch-lotC2-interrupteurs.mjs --dry-run | --apply");
  process.exit(1);
}
console.log("Mode : " + (apply ? "APPLY (ecriture)" : "DRY-RUN (aucune ecriture)"));

function fail(msg) {
  console.error("ECHEC : " + msg);
  console.error("Aucune modification n'a ete ecrite.");
  process.exit(1);
}

if (!fs.existsSync(F_CFG)) fail("components/AdminConfig.js introuvable (lancez le script depuis la racine du projet, avec les lots C1 et C5 appliques).");

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
function countRegex(doc, re) {
  return (doc.src.match(new RegExp(re.source, "gm")) || []).length;
}
function replaceRegexOnce(doc, re, replacement, label, hints) {
  const n = countRegex(doc, re);
  if (n !== 1) {
    if (n === 0) showContext(doc, hints);
    fail(label + " : " + n + " occurrence(s) trouvee(s) au lieu de 1.");
  }
  doc.src = doc.src.replace(re, (...m) => (typeof replacement === "function" ? replacement(...m) : replacement));
}
// Insere du texte juste avant la ligne qui correspond au motif (meme indentation transmise a la fonction)
function insertBeforeLineRegex(doc, re, make, label, hints) {
  const n = countRegex(doc, re);
  if (n !== 1) {
    if (n === 0) showContext(doc, hints);
    fail(label + " : " + n + " occurrence(s) trouvee(s) au lieu de 1.");
  }
  const idx = doc.src.search(re);
  const start = doc.src.lastIndexOf("\n", idx) + 1;
  const indent = doc.src.slice(start).match(/^[ \t]*/)[0];
  doc.src = doc.src.slice(0, start) + make(indent) + "\n" + doc.src.slice(start);
}
function insertAfterLineRegex(doc, re, make, label, hints) {
  const n = countRegex(doc, re);
  if (n !== 1) {
    if (n === 0) showContext(doc, hints);
    fail(label + " : " + n + " occurrence(s) trouvee(s) au lieu de 1.");
  }
  const idx = doc.src.search(re);
  const start = doc.src.lastIndexOf("\n", idx) + 1;
  const indent = doc.src.slice(start).match(/^[ \t]*/)[0];
  const eol = doc.src.indexOf("\n", idx);
  const end = eol < 0 ? doc.src.length : eol;
  doc.src = doc.src.slice(0, end) + "\n" + make(indent) + doc.src.slice(end);
}

const cfg = readSrc(F_CFG);
if (cfg.src.includes(MARK) && fs.existsSync(F_LIB) && fs.existsSync(F_COMP)) {
  console.log("Deja applique (" + MARK + " present). Rien a faire.");
  process.exit(0);
}
if (cfg.src.includes(MARK)) fail("Etat incoherent : le marqueur est present dans AdminConfig.js mais lib/configToggle.js ou components/ConfigSwitch.js manque. Restaurez AdminConfig.js (git checkout) puis relancez.");
if (fs.existsSync(F_LIB) || fs.existsSync(F_COMP)) fail("lib/configToggle.js ou components/ConfigSwitch.js existe deja sans que AdminConfig.js soit patche.");
for (const m of ["ZENORIA_CONFIG_C1_V1", "ZENORIA_CONFIG_C5_V1"]) {
  if (!cfg.src.includes(m)) fail("components/AdminConfig.js ne contient pas " + m + " : les lots C1 et C5 doivent etre appliques avant.");
}
console.log("components/AdminConfig.js (fins de ligne " + (cfg.crlf ? "Windows CRLF" : "LF") + ")");
const before = cfg.src.split("\n").length;

// ------------------------------------------------------------------
// Nouveaux fichiers
// ------------------------------------------------------------------
const LIB = String.raw`// ZENORIA_CONFIG_C2_V1 : interrupteurs simples de l'onglet Accueil › Configuration.
// Chaque interrupteur ne modifie QU'UN champ d'un réglage de site_settings et conserve tout le reste tel quel.
// Le journal des changements (lot C5) enregistre chaque bascule, avec l'e-mail du compte connecté.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export const SETTINGS_TABLE = "site_settings";
const SEEN = " Les visiteuses le voient au prochain chargement de la page.";

// id de la ligne (buildConfigOverview) -> réglage et champ modifié
export const TOGGLES = {
  free_shipping: {
    key: "shipping",
    path: ["enabled"],
    on: "Livraison offerte activée : elle s'applique dès que le panier atteint le seuil.",
    off: "Livraison offerte désactivée : la livraison est facturée quel que soit le montant du panier.",
  },
  reviews_enabled: {
    key: "reviews",
    path: ["enabled"],
    on: "Avis clientes activés : avis et charte des avis visibles sur le site.",
    off: "Avis clientes désactivés : avis et charte des avis masqués. Les avis déjà déposés sont conservés.",
  },
  contact_email: { key: "contact", path: ["email", "enabled"], channel: "email", on: "E-mail affiché dans le pied de page.", off: "E-mail masqué dans le pied de page." },
  contact_whatsapp: { key: "contact", path: ["whatsapp", "enabled"], channel: "whatsapp", on: "WhatsApp affiché dans le pied de page.", off: "WhatsApp masqué dans le pied de page." },
  contact_signal: { key: "contact", path: ["signal", "enabled"], channel: "signal", on: "Signal affiché dans le pied de page.", off: "Signal masqué dans le pied de page." },
};
const CHANNELS = ["email", "whatsapp", "signal"];

export function isToggleId(id) {
  return typeof id === "string" && Object.prototype.hasOwnProperty.call(TOGGLES, id);
}

function isObj(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
export function readPath(value, path) {
  let cur = value;
  for (const k of path) {
    if (!isObj(cur)) return undefined;
    cur = cur[k];
  }
  return cur;
}
// Copie la valeur en changeant UN seul champ. Ne modifie jamais l'original.
export function setPath(value, path, next) {
  const head = path[0];
  const rest = path.slice(1);
  const base = isObj(value) ? value : {};
  const out = Object.assign({}, base);
  out[head] = rest.length ? setPath(base[head], rest, next) : next;
  return out;
}

function contactWarning(t, value, next) {
  if (!t.channel) return "";
  if (next) {
    const v = readPath(value, [t.channel, "value"]);
    return typeof v === "string" && v.trim() ? "" : "Attention : aucune valeur n'est renseignée pour ce canal, il ne s'affichera pas sur le site (à renseigner dans Contenu du site › Contact).";
  }
  const anyActive = CHANNELS.some((ch) => readPath(value, [ch, "enabled"]) === true);
  return anyActive ? "" : "Attention : plus aucun canal de contact n'est actif sur le site.";
}

// Prépare l'écriture. rows : { clé: { value, updated_at, ... } } (lecture de site_settings par l'onglet).
export function planToggle(rows, id, next) {
  if (!isToggleId(id)) return { ok: false, error: "Interrupteur inconnu." };
  if (typeof next !== "boolean") return { ok: false, error: "Valeur invalide." };
  const t = TOGGLES[id];
  const row = rows ? rows[t.key] : null;
  if (!row) return { ok: false, error: "Le réglage « " + t.key + " » n'existe pas encore en base : enregistrez-le d'abord depuis son écran (Contenu du site)." };
  if (!isObj(row.value)) return { ok: false, error: "Le réglage « " + t.key + " » est illisible : ouvrez son écran (Contenu du site) pour le corriger." };
  if (typeof row.updated_at !== "string" || !row.updated_at) return { ok: false, error: "La date de dernière modification du réglage est absente : cliquez sur « Actualiser »." };
  const current = readPath(row.value, t.path);
  if (typeof current !== "boolean") return { ok: false, error: "La valeur actuelle de ce réglage est illisible : ouvrez son écran (Contenu du site) pour le corriger." };
  if (current === next) return { ok: true, noop: true, t, row };
  const value = setPath(row.value, t.path, next);
  return { ok: true, noop: false, t, row, value, warn: contactWarning(t, value, next) };
}

export function friendlyError(err) {
  const msg = err && err.message ? err.message : typeof err === "string" ? err : "";
  if (/violates check constraint|site_settings_[a-z_]+_valid/i.test(msg)) {
    return "La base refuse cette valeur (règle de validation du réglage). Ouvrez l'écran du réglage pour vérifier ses champs.";
  }
  if (/row-level security|permission denied|not authorized|unauthorized|jwt/i.test(msg)) {
    return "Modification refusée : ce compte n'a pas les droits d'administration.";
  }
  if (/relation|does not exist|schema cache|could not find the table/i.test(msg)) {
    return "La table des réglages est introuvable. Vérifiez que supabase_site_settings.sql a été exécuté.";
  }
  if (/failed to fetch|network|reseau|timeout/i.test(msg)) {
    return "Connexion impossible. Réessayez dans un instant.";
  }
  return "Échec de l'enregistrement" + (msg ? " (" + msg + ")" : "") + ".";
}

// Écrit le champ visé, seulement si la ligne n'a pas changé depuis son affichage (comparaison sur updated_at).
export async function toggleSetting(client, rows, id, next) {
  const plan = planToggle(rows, id, next);
  if (!plan.ok) return { ok: false, conflict: false, error: plan.error };
  if (plan.noop) return { ok: true, noop: true, message: "Ce réglage était déjà dans cet état.", warn: "" };
  try {
    const res = await client
      .from(SETTINGS_TABLE)
      .update({ value: plan.value })
      .eq("key", plan.t.key)
      .eq("updated_at", plan.row.updated_at)
      .select("key");
    if (res.error) return { ok: false, conflict: false, error: friendlyError(res.error) };
    if (!Array.isArray(res.data) || res.data.length !== 1) {
      return {
        ok: false,
        conflict: true,
        error: "Le réglage n'a pas été modifié : il a changé entre-temps (autre écran ou autre session), ou ce compte n'a pas les droits d'administration. Les valeurs ont été relues, vérifiez puis recommencez.",
      };
    }
    return { ok: true, noop: false, message: (next ? plan.t.on : plan.t.off) + SEEN, warn: plan.warn };
  } catch (e) {
    return { ok: false, conflict: false, error: friendlyError(e) };
  }
}

// rows : réglages lus par l'onglet ; reload : relit les réglages après une bascule (et donc le journal)
export function useConfigToggle(rows, reload) {
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState(null);
  const busy = useRef(false);
  const run = useCallback(
    async (id, next) => {
      if (busy.current) return;
      busy.current = true;
      setBusyId(id);
      setNotice(null);
      let res;
      try {
        res = await toggleSetting(supabase, rows, id, next);
      } catch (e) {
        res = { ok: false, conflict: false, error: friendlyError(e) };
      }
      if (res.ok) setNotice({ type: res.warn ? "warn" : "ok", text: res.message + (res.warn ? " " + res.warn : "") });
      else setNotice({ type: "error", text: res.error });
      if (res.ok || res.conflict) reload();
      busy.current = false;
      setBusyId("");
    },
    [rows, reload]
  );
  useEffect(() => {
    if (!notice || notice.type === "error") return undefined;
    const timer = setTimeout(() => setNotice(null), 9000);
    return () => clearTimeout(timer);
  }, [notice]);
  return { busyId, notice, run };
}
`;

const COMP = String.raw`// ZENORIA_CONFIG_C2_V1 : état d'un réglage dans l'onglet Configuration.
// Interrupteur pour les réglages simples (livraison offerte, avis, canaux de contact) ; pastille de lecture seule pour les autres.
import React from "react";
import { isToggleId } from "@/lib/configToggle";

function flagLabel(f) {
  return f === true ? "Activé" : f === false ? "Désactivé" : "Non défini";
}
function flagClass(f) {
  return f === true ? "bg-emerald-50 text-emerald-700" : f === false ? "bg-[#f0e6ea] text-[#8b737e]" : "bg-amber-50 text-amber-800";
}

export default function FlagControl({ it, busyId, onToggle }) {
  const canToggle = typeof onToggle === "function" && isToggleId(it.id) && typeof it.flag === "boolean";
  if (!canToggle) {
    return (
      <span
        data-state={it.flag === true ? "on" : it.flag === false ? "off" : "unknown"}
        className={"inline-block rounded-full px-2.5 py-0.5 text-xs " + flagClass(it.flag)}
      >
        {flagLabel(it.flag)}
      </span>
    );
  }
  const busy = busyId === it.id;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-xs text-[#756a70]" data-testid={"config-state-" + it.id}>
        {busy ? "Enregistrement…" : flagLabel(it.flag)}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={it.flag}
        aria-label={it.label}
        aria-busy={busy}
        disabled={Boolean(busyId)}
        onClick={() => onToggle(it.id, !it.flag)}
        data-testid={"config-switch-" + it.id}
        className={"relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-60 " + (it.flag ? "bg-[#8f6075]" : "bg-[#d9c5cc]")}
      >
        <span className={"absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow transition-transform " + (it.flag ? "translate-x-5" : "")} />
      </button>
    </span>
  );
}
`;

// ------------------------------------------------------------------
// components/AdminConfig.js
// ------------------------------------------------------------------
// 1. imports
insertAfterLineRegex(
  cfg,
  /^import ConfigLog from "@\/components\/ConfigLog";[ \t]*$/m,
  () => "// " + MARK + " : interrupteurs simples\nimport FlagControl from \"@/components/ConfigSwitch\";\nimport { useConfigToggle } from \"@/lib/configToggle\";",
  "Import ConfigLog (AdminConfig.js)",
  ['import ConfigLog from "@/components/ConfigLog"']
);
// 2. signature de ConfigView
replaceRegexOnce(
  cfg,
  /export function ConfigView\(\{\s*sections,\s*loaded,\s*loading,\s*error,\s*onGo,\s*onReload\s*\}\) \{/,
  "export function ConfigView({ sections, loaded, loading, error, onGo, onReload, onToggle, busyId, notice }) { // " + MARK,
  "Signature de ConfigView (AdminConfig.js)",
  ["export function ConfigView"]
);
// 3. la pastille devient un interrupteur pour les reglages simples
replaceRegexOnce(
  cfg,
  /\{it\.flag !== undefined \? \(\s*<span\s+data-state=\{it\.flag === true \? "on" : it\.flag === false \? "off" : "unknown"\}\s+className=\{"inline-block rounded-full px-2\.5 py-0\.5 text-xs " \+ flagClass\(it\.flag\)\}\s*>\s*\{flagLabel\(it\.flag\)\}\s*<\/span>\s*\) : \(/,
  '{it.flag !== undefined ? (\n                      <FlagControl it={it} busyId={busyId} onToggle={onToggle} />\n                    ) : (',
  "Pastille de l'etat (AdminConfig.js)",
  ["it.flag !== undefined", "flagLabel(it.flag)"]
);
// 4. bandeau de resultat, avant la grille des cartes
insertBeforeLineRegex(
  cfg,
  /^[ \t]*\{loaded && !error \? \(/m,
  (indent) =>
    indent + "{/* " + MARK + " : résultat de la dernière bascule */}\n" +
    indent + "{notice ? (\n" +
    indent + "  <div\n" +
    indent + '    role={notice.type === "error" ? "alert" : "status"}\n' +
    indent + '    data-testid="config-notice"\n' +
    indent + '    className={"mb-5 rounded-xl px-4 py-3 text-[13px] border " + (notice.type === "error" ? "bg-red-50 border-red-200 text-red-700" : notice.type === "warn" ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-emerald-50 border-emerald-200 text-emerald-800")}\n' +
    indent + "  >\n" +
    indent + "    {notice.text}\n" +
    indent + "  </div>\n" +
    indent + ") : null}",
  "Grille des cartes (AdminConfig.js)",
  ["loaded && !error"]
);
// 5. conteneur : le hook et les trois proprietes
insertAfterLineRegex(
  cfg,
  /^[ \t]*const cfg = useSiteConfig\(\);[ \t]*$/m,
  (indent) => indent + "const toggle = useConfigToggle(cfg.rows, cfg.reload); // " + MARK,
  "Appel de useSiteConfig (AdminConfig.js)",
  ["useSiteConfig()"]
);
replaceRegexOnce(
  cfg,
  /(<ConfigView\b[^>]*?)\s*onReload=\{cfg\.reload\}\s*\/>/,
  (m, head) => head + " onReload={cfg.reload} onToggle={toggle.run} busyId={toggle.busyId} notice={toggle.notice} />",
  "Rendu de ConfigView (AdminConfig.js)",
  ["<ConfigView", "onReload={cfg.reload}"]
);
// 6. texte d'en-tete (facultatif : ignore s'il a deja ete modifie)
{
  const old = "L&apos;état de chaque réglage. Lecture seule : chaque réglage se modifie sur son écran (lien « Modifier »).";
  if (occurrences(cfg.src, old) === 1) {
    cfg.src = cfg.src.replace(old, () => "L&apos;état de chaque réglage. La livraison offerte, les avis et les canaux de contact se basculent ici ; le reste se modifie sur son écran (lien « Modifier »).");
  } else {
    console.log("  (texte d'en-tete non reconnu : laisse tel quel, sans importance)");
  }
}

// ------------------------------------------------------------------
// Controles finaux
// ------------------------------------------------------------------
if (occurrences(cfg.src, MARK) < 4) fail("AdminConfig.js : marqueur attendu au moins 4 fois, trouve " + occurrences(cfg.src, MARK) + ".");
if (occurrences(cfg.src, "<FlagControl") !== 1) fail("AdminConfig.js : <FlagControl doit apparaitre une seule fois.");
if (occurrences(cfg.src, "useConfigToggle(") !== 1) fail("AdminConfig.js : useConfigToggle( doit etre appele une seule fois.");
if (occurrences(cfg.src, 'data-testid="config-notice"') !== 1) fail("AdminConfig.js : un seul bandeau de resultat attendu.");
if (occurrences(cfg.src, "<ConfigView") !== 1 || occurrences(cfg.src, "onToggle={toggle.run}") !== 1) fail("AdminConfig.js : <ConfigView doit recevoir onToggle une seule fois.");

const eol = cfg.crlf ? "\r\n" : "\n";
const toEol = (s) => s.replace(/\n/g, eol);
console.log("");
console.log("  1. lib/configToggle.js (nouveau)                               OK");
console.log("  2. components/ConfigSwitch.js (nouveau)                        OK");
console.log("  3. AdminConfig.js : interrupteurs, bandeau de resultat, hook   OK");
console.log("  Lignes AdminConfig.js : " + before + " -> " + cfg.src.split("\n").length);

if (apply) {
  fs.writeFileSync(F_LIB, toEol(LIB), "utf8");
  fs.writeFileSync(F_COMP, toEol(COMP), "utf8");
  fs.writeFileSync(F_CFG, serialize(cfg), "utf8");
  console.log("\nEcrit : lib/configToggle.js, components/ConfigSwitch.js, components/AdminConfig.js");
  console.log("Prochaine etape : npm run build");
} else {
  console.log("\nDRY-RUN termine : rien n'a ete ecrit. Relancez avec --apply.");
}
