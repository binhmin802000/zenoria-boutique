#!/usr/bin/env node
// ============================================================
// PATCH LOT 2b (3/3) : pages/api/cron/expire-pending-orders.js — filet de securite pour la liberation du stock
// Modifie uniquement ce fichier. Reutilise release_order_items (lot 2a-bis).
//
// Ajoute : avant de passer les commandes "pending" de plus de 24h en "expired", libere leur reservation de
// stock/pieces. Ce cas ne devrait normalement jamais se produire (le webhook checkout.session.expired libere
// deja la reservation des 31 minutes), mais sert de filet de securite si cet evenement a ete manque.
//
// Usage, depuis la racine du projet (dossier zenoria) :
//   node scripts/patch-lot2b-cron.mjs --dry-run   -> controle chaque repere, n'ecrit RIEN
//   node scripts/patch-lot2b-cron.mjs --apply     -> ecrit si TOUT est conforme
// ============================================================
import fs from "node:fs";

const MARKER = "ZENORIA_STOCK_V1";
const mode = process.argv.includes("--apply") ? "apply" : process.argv.includes("--dry-run") ? "dry" : null;
const FILES = [
 {
  "path": "pages/api/cron/expire-pending-orders.js",
  "patches": [
   {
    "name": "E1 liberation des reservations de stock/pieces juste avant le passage en expired",
    "find": [
     "const ids = (toExpire || []).map((o) => o.id);",
     "if (ids.length === 0) {",
     "return res.status(200).json({ ok: true, expired: 0 });",
     "}",
     "const { error: updateErr } = await supabaseAdmin"
    ],
    "replace": [
     "const ids = (toExpire || []).map((o) => o.id);",
     "    if (ids.length === 0) {",
     "      return res.status(200).json({ ok: true, expired: 0 });",
     "    }",
     "    // ZENORIA_STOCK_V1 : filet de securite (le webhook checkout.session.expired libere deja la",
     "    // reservation immediatement dans le cas normal) : si l'evenement a ete manque, on libere ici.",
     "    for (const id of ids) {",
     "      const { error: releaseErr } = await supabaseAdmin.rpc(\"release_order_items\", { p_order_id: id, p_reason: \"expired\" });",
     "      if (releaseErr) {",
     "        console.error(\"[cron-expire] échec libération stock/pièces pour la commande \" + id + \" :\", releaseErr.message);",
     "      }",
     "    }",
     "    const { error: updateErr } = await supabaseAdmin"
    ]
   }
  ],
  "finals": [
   "release_order_items",
   "ZENORIA_STOCK_V1"
  ],
  "forbidden": []
 }
];

function fail(message) {
  console.error("\nECHEC : " + message);
  console.error("Aucun fichier n'a ete modifie.");
  process.exit(1);
}
if (!mode) fail("indiquez --dry-run ou --apply.");

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const toRegex = (lines) =>
  new RegExp(escapeRegex(lines.map((l) => l.trim()).join("\n")).replace(/\s+/g, "\\s+"), "g");

console.log("Mode : " + (mode === "apply" ? "APPLICATION" : "DRY-RUN (aucune ecriture)") + "\n");
const results = [];
const problems = [];

for (const f of FILES) {
  if (!fs.existsSync(f.path)) fail(f.path + " est introuvable. Lancez la commande depuis la racine du projet (dossier zenoria).");
  const original = fs.readFileSync(f.path, "utf8");
  const crlf = original.includes("\r\n");
  let content = original.replace(/\r\n/g, "\n");
  console.log(f.path + " (fins de ligne " + (crlf ? "Windows CRLF" : "Unix LF") + ")");
  if (content.includes(MARKER)) fail(f.path + " : le patch est deja applique (marqueur " + MARKER + " present).");
  const before = problems.length;
  for (const p of f.patches) {
    const count = (content.match(toRegex(p.find)) || []).length;
    console.log((count === 1 ? "  OK  " : " ERREUR ") + p.name + " : " + count + " occurrence(s)");
    if (count !== 1) problems.push(f.path + " : " + p.name + " (" + count + " occurrence(s) au lieu de 1)");
  }
  if (problems.length === before) for (const p of f.patches) content = content.replace(toRegex(p.find), () => p.replace.join("\n"));
  results.push({ f, content, crlf });
}
if (problems.length > 0) fail("verifier :\n  - " + problems.join("\n  - "));

for (const r of results) {
  for (const needle of r.f.finals) if (!r.content.includes(needle)) fail("controle final " + r.f.path + " : « " + needle + " » absent apres patch.");
  for (const bad of r.f.forbidden) if (r.content.includes(bad)) fail("controle final " + r.f.path + " : « " + bad + " » est toujours present apres patch.");
}
if (mode === "dry") {
  console.log("\nDRY-RUN termine : les " + FILES.length + " fichiers sont conformes. Rien n'a ete ecrit.");
  console.log("Etape suivante : node scripts/patch-lot2b-cron.mjs --apply");
  process.exit(0);
}
for (const r of results) fs.writeFileSync(r.f.path, r.crlf ? r.content.replace(/\n/g, "\r\n") : r.content, "utf8");
console.log("\nPATCH APPLIQUE : " + results.length + " fichier(s) modifie(s).");
console.log("Etapes suivantes : git status --short, puis npm run build.");
console.log("Retour arriere avant commit : git restore pages/api/cron/expire-pending-orders.js");
