#!/usr/bin/env node
// ============================================================
// PATCH LOT 5-BIS-C : dates en jours calendaires de Paris (interface)
// Cree     : lib/dates.js  (utilitaire partage, utilise uniquement par AdminCrm.js pour l'instant)
// Modifie  : components/AdminCrm.js  (aucun autre fichier, aucune base de donnees)
// Pre-requis : le lot 5-bis-A est applique (marqueur ZENORIA_ORDER_JOURNAL_V1 dans AdminCrm.js).
//
// Usage, depuis la racine du projet (dossier zenoria) :
//   node scripts/patch-lot5bis-c.mjs --dry-run   -> controle chaque ancre, n'ecrit RIEN
//   node scripts/patch-lot5bis-c.mjs --apply     -> applique si TOUTES les ancres sont trouvees une seule fois
// ============================================================
import fs from "node:fs";
import path from "node:path";

const TARGET = path.join("components", "AdminCrm.js");
const LIB = path.join("lib", "dates.js");
const MARKER = "ZENORIA_ORDER_DATES_V1";
const REQUIRED = "ZENORIA_ORDER_JOURNAL_V1";
const mode = process.argv.includes("--apply") ? "apply" : process.argv.includes("--dry-run") ? "dry" : null;

const DATES_JS = "// ============================================================\n// UTILITAIRE DE DATES PARTAGE — ZENORIA_DATES_V1\n// Toutes les dates de l'application sont des instants (UTC en base). Pour l'affichage et pour les regles metier\n// (echeance, retard, filtres), c'est le JOUR CALENDAIRE DE PARIS (Europe/Paris) qui compte, ete comme hiver :\n// le changement d'heure est gere par le fuseau, jamais par un decalage ecrit a la main.\n// Les « jours » manipules ici sont des chaines \"AAAA-MM-JJ\".\n// ============================================================\nexport const PARIS_TIME_ZONE = \"Europe/Paris\";\n\n// Jour calendaire de Paris d'un instant (Date, nombre de millisecondes ou chaine ISO). \"\" si la valeur est invalide.\nexport function parisDay(value) {\n  const d = new Date(value);\n  if (Number.isNaN(d.getTime())) return \"\";\n  return d.toLocaleDateString(\"sv-SE\", { timeZone: PARIS_TIME_ZONE }); // AAAA-MM-JJ\n}\n\nfunction dayToUtcMs(day) {\n  const m = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(String(day || \"\"));\n  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN;\n}\n\n// Nombre de jours calendaires entre deux jours \"AAAA-MM-JJ\" : positif si toDay est apres fromDay. 0 si une valeur est invalide.\nexport function parisDayDiff(fromDay, toDay) {\n  const a = dayToUtcMs(fromDay);\n  const b = dayToUtcMs(toDay);\n  if (Number.isNaN(a) || Number.isNaN(b)) return 0;\n  return Math.round((b - a) / 86400000);\n}\n\n// Ajoute (ou retire, si n est negatif) n jours calendaires a un jour \"AAAA-MM-JJ\". Chaine vide si le jour est invalide.\nexport function addDaysToParisDay(day, n) {\n  const t = dayToUtcMs(day);\n  if (Number.isNaN(t)) return \"\";\n  return new Date(t + Number(n) * 86400000).toISOString().slice(0, 10);\n}\n\nexport function formatParisDate(value) {\n  if (!value) return \"—\";\n  const d = new Date(value);\n  return Number.isNaN(d.getTime()) ? \"—\" : d.toLocaleDateString(\"fr-FR\", { timeZone: PARIS_TIME_ZONE });\n}\n\nexport function formatParisDateTime(value) {\n  if (!value) return \"—\";\n  const d = new Date(value);\n  return Number.isNaN(d.getTime()) ? \"—\" : d.toLocaleString(\"fr-FR\", { dateStyle: \"short\", timeStyle: \"short\", timeZone: PARIS_TIME_ZONE });\n}\n";
const PATCHES = [
  {
    "name": "C1 import de l'utilitaire de dates",
    "find": [
      "const TIME_ZONE = \"Europe/Paris\";"
    ],
    "replace": [
      "import { parisDay, parisDayDiff, addDaysToParisDay } from \"@/lib/dates\"; // ZENORIA_ORDER_DATES_V1",
      "const TIME_ZONE = \"Europe/Paris\";"
    ]
  },
  {
    "name": "C2 suppression de la copie locale de parisDay (remplacee par l'utilitaire)",
    "find": [
      "function parisDay(value) {",
      "return new Date(value).toLocaleDateString(\"sv-SE\", { timeZone: TIME_ZONE }); // AAAA-MM-JJ",
      "}"
    ],
    "replace": [
      "// ZENORIA_ORDER_DATES_V1 : parisDay vient de lib/dates.js (jour calendaire de Paris, AAAA-MM-JJ)"
    ]
  },
  {
    "name": "C3 transferDueState en jours calendaires de Paris",
    "find": [
      "function transferDueState(order, now) {",
      "if (!order.transfer_due_at) return null;",
      "const diff = now - new Date(order.transfer_due_at).getTime();",
      "if (diff < 0) {",
      "const days = Math.ceil(-diff / 86400000);",
      "return { level: \"ok\", label: \"En attente\", detail: \"échéance dans \" + days + \" jour\" + (days > 1 ? \"s\" : \"\") };",
      "}",
      "const late = Math.floor(diff / 86400000);",
      "const detail = late === 0 ? \"échéance dépassée depuis moins d'un jour\" : \"échéance dépassée de \" + late + \" jour\" + (late > 1 ? \"s\" : \"\");",
      "if (late >= TRANSFER_LATE_DAYS) return { level: \"late\", label: \"En retard\", detail };",
      "return { level: \"over\", label: \"Échéance dépassée\", detail };",
      "}"
    ],
    "replace": [
      "// ZENORIA_ORDER_DATES_V1 : l'échéance s'apprécie en JOURS CALENDAIRES de Paris (et non en blocs de 24 h).",
      "// Jusqu'à la fin du jour d'échéance la commande est « en attente » ; ensuite chaque jour écoulé compte pour un jour de retard.",
      "function transferDueState(order, now) {",
      "  if (!order.transfer_due_at) return null;",
      "  const left = parisDayDiff(parisDay(now), parisDay(order.transfer_due_at)); // jours restants jusqu'au jour d'échéance",
      "  if (left >= 0) {",
      "    return { level: \"ok\", label: \"En attente\", detail: left === 0 ? \"échéance aujourd'hui\" : \"échéance dans \" + left + \" jour\" + (left > 1 ? \"s\" : \"\") };",
      "  }",
      "  const late = -left;",
      "  const detail = \"échéance dépassée de \" + late + \" jour\" + (late > 1 ? \"s\" : \"\");",
      "  if (late >= TRANSFER_LATE_DAYS) return { level: \"late\", label: \"En retard\", detail };",
      "  return { level: \"over\", label: \"Échéance dépassée\", detail };",
      "}"
    ]
  },
  {
    "name": "C4 echeance affichee en date seule",
    "find": [
      "<br />Échéance : {formatDateTime(order.transfer_due_at)}{state ? \" (\" + state.detail + \")\" : \"\"}"
    ],
    "replace": [
      "<br />Échéance : {formatDateOnly(order.transfer_due_at)}{state ? \" (\" + state.detail + \")\" : \"\"}"
    ]
  },
  {
    "name": "C5 boutons Aujourd'hui / 7 jours / 30 jours en jours de Paris (et non en UTC)",
    "find": [
      "const toIso = (d) => d.toISOString().slice(0, 10);",
      "const now = new Date();",
      "if (preset === \"today\") {",
      "const today = toIso(now);",
      "setDateFrom(today);",
      "setDateTo(today);",
      "} else if (preset === \"7d\") {",
      "const from = new Date(now.getTime() - 6 * 24 * 3600 * 1000);",
      "setDateFrom(toIso(from));",
      "setDateTo(toIso(now));",
      "} else if (preset === \"30d\") {",
      "const from = new Date(now.getTime() - 29 * 24 * 3600 * 1000);",
      "setDateFrom(toIso(from));",
      "setDateTo(toIso(now));",
      "} else {"
    ],
    "replace": [
      "// ZENORIA_ORDER_DATES_V1 : les bornes sont des jours calendaires de Paris (l'ancien calcul en UTC donnait la veille entre minuit et 1 h/2 h)",
      "    const today = parisDay(new Date());",
      "    if (preset === \"today\") {",
      "      setDateFrom(today);",
      "      setDateTo(today);",
      "    } else if (preset === \"7d\") {",
      "      setDateFrom(addDaysToParisDay(today, -6));",
      "      setDateTo(today);",
      "    } else if (preset === \"30d\") {",
      "      setDateFrom(addDaysToParisDay(today, -29));",
      "      setDateTo(today);",
      "    } else {"
    ]
  }
];

function fail(message) {
  console.error("\nECHEC : " + message);
  console.error("Aucun fichier n'a ete modifie.");
  process.exit(1);
}

if (!mode) fail("indiquez --dry-run ou --apply.");
if (!fs.existsSync(TARGET)) fail(TARGET + " est introuvable. Lancez la commande depuis la racine du projet (dossier zenoria).");
if (!fs.existsSync("lib")) fail("le dossier lib est introuvable. Lancez la commande depuis la racine du projet.");
if (fs.existsSync(LIB)) fail(LIB + " existe deja : verifiez qu'il ne s'agit pas d'un lot deja applique.");

const original = fs.readFileSync(TARGET, "utf8");
const usesCrlf = original.includes("\r\n");
let content = original.replace(/\r\n/g, "\n");

if (content.includes(MARKER)) fail("le patch est deja applique (marqueur " + MARKER + " present).");
if (!content.includes(REQUIRED)) fail("le lot 5-bis-A n'est pas applique (marqueur " + REQUIRED + " absent) : appliquez-le d'abord.");

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const toRegex = (lines) => new RegExp(escapeRegex(lines.map((l) => l.trim()).join("\n")).replace(/\s+/g, "\\s+"), "g");

console.log("Fichier : " + TARGET + " (fins de ligne " + (usesCrlf ? "Windows CRLF" : "Unix LF") + ")");
console.log("Mode    : " + (mode === "apply" ? "APPLICATION" : "DRY-RUN (aucune ecriture)") + "\n");

const problems = [];
for (const p of PATCHES) {
  const matches = content.match(toRegex(p.find));
  const count = matches ? matches.length : 0;
  console.log((count === 1 ? "  OK  " : " ERREUR ") + p.name + " : " + count + " occurrence(s)");
  if (count !== 1) problems.push(p.name + " (" + count + " occurrence(s) au lieu de 1)");
}
if (problems.length > 0) fail("ancre(s) a verifier :\n  - " + problems.join("\n  - "));

for (const p of PATCHES) {
  const replacement = p.replace.join("\n");
  content = content.replace(toRegex(p.find), () => replacement);
}
for (const needle of ['from "@/lib/dates"', "parisDayDiff(parisDay(now)", "addDaysToParisDay(today, -6)", "formatDateOnly(order.transfer_due_at)"]) {
  if (!content.includes(needle)) fail("controle final : " + needle + " absent apres patch.");
}
if (/function parisDay\(/.test(content)) fail("controle final : la copie locale de parisDay est toujours presente.");

if (mode === "dry") {
  console.log("\nDRY-RUN termine : les " + PATCHES.length + " ancres sont trouvees une seule fois. Rien n'a ete ecrit.");
  console.log("Etape suivante : node scripts/patch-lot5bis-c.mjs --apply");
  process.exit(0);
}

fs.writeFileSync(LIB, DATES_JS, "utf8");
fs.writeFileSync(TARGET, usesCrlf ? content.replace(/\n/g, "\r\n") : content, "utf8");
console.log("\nPATCH APPLIQUE : " + LIB + " cree, " + PATCHES.length + " modifications dans " + TARGET + ".");
console.log("Etapes suivantes : git status --short, puis npm run build, puis npm run dev.");
