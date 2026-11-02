#!/usr/bin/env node
// ============================================================
// COMPLEMENT LOT 2c-2 : les deux textes valides apres coup (a appliquer APRES patch-lot2c2-panier.mjs)
//   - components/ProductParts.js : message prerempli « Nous ecrire » d'une piece reservee
//   - pages/quiz.js : piece unique ajoutee deux fois -> meme message que l'accueil
//   node scripts/patch-lot2c2-complement.mjs --dry-run
//   node scripts/patch-lot2c2-complement.mjs --apply
// ============================================================
import fs from "node:fs";
const MARKER = "ZENORIA_STOCK_UI2B_V1";
const mode = process.argv.includes("--apply") ? "apply" : process.argv.includes("--dry-run") ? "dry" : null;
const FILES = [
 {
  "path": "components/ProductParts.js",
  "patches": [
   {
    "name": "B1 message prerempli « Nous écrire » d'une piece reservee",
    "find": [
     "`Bonjour,\\n\\nLa pièce unique « ${product.name} » est réservée. Pourriez-vous me dire si elle se libère ?\\n`,",
     "`Bonjour, la pièce unique « ${product.name} » est réservée. Pourriez-vous me dire si elle se libère ?`"
    ],
    "replace": [
     "`Bonjour,\\n\\nLa pièce unique « ${product.name} » m'intéresse, mais elle est actuellement réservée. Pourriez-vous me prévenir si elle redevient disponible ?\\n`, // ZENORIA_STOCK_UI2B_V1",
     "      `Bonjour, la pièce unique « ${product.name} » m'intéresse, mais elle est actuellement réservée. Pourriez-vous me prévenir si elle redevient disponible ?`"
    ]
   }
  ],
  "finals": [
   "redevient disponible"
  ],
  "forbidden": [
   "si elle se libère"
  ]
 },
 {
  "path": "pages/quiz.js",
  "patches": [
   {
    "name": "B2 quiz : message piece unique aligne sur l'accueil",
    "find": [
     "setToast({ kind: \"warn\", text: `Il ne reste pas d'autre exemplaire de « ${product.name} ».` });"
    ],
    "replace": [
     "setToast({ kind: \"warn\", text: product.isUnique === true ? `« ${product.name} » est une pièce unique : un seul exemplaire possible.` : `Il ne reste pas d'autre exemplaire de « ${product.name} ».` }); // ZENORIA_STOCK_UI2B_V1"
    ]
   }
  ],
  "finals": [
   "un seul exemplaire possible"
  ],
  "forbidden": []
 }
];
function fail(m) { console.error("\nECHEC : " + m); console.error("Aucun fichier n'a ete modifie."); process.exit(1); }
if (!mode) fail("indiquez --dry-run ou --apply.");
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const toRegex = (lines) => new RegExp(esc(lines.map((l) => l.trim()).join("\n")).replace(/\s+/g, "\\s+"), "g");
console.log("Mode : " + (mode === "apply" ? "APPLICATION" : "DRY-RUN (aucune ecriture)") + "\n");
const results = []; const problems = [];
for (const f of FILES) {
  if (!fs.existsSync(f.path)) fail(f.path + " est introuvable. Lancez la commande depuis la racine du projet (dossier zenoria).");
  const original = fs.readFileSync(f.path, "utf8");
  const crlf = original.includes("\r\n");
  let content = original.replace(/\r\n/g, "\n");
  console.log(f.path + " (fins de ligne " + (crlf ? "Windows CRLF" : "Unix LF") + ")");
  if (content.includes(MARKER)) fail(f.path + " : le complement est deja applique (marqueur " + MARKER + " present).");
  if (!content.includes("ZENORIA_STOCK_UI2_V1")) fail(f.path + " : le patch 2c-2 n'est pas applique (marqueur ZENORIA_STOCK_UI2_V1 absent).");
  const before = problems.length;
  for (const p of f.patches) { const c = (content.match(toRegex(p.find)) || []).length; console.log((c === 1 ? "  OK  " : " ERREUR ") + p.name + " : " + c + " occurrence(s)"); if (c !== 1) problems.push(f.path + " : " + p.name + " (" + c + " occurrence(s) au lieu de 1)"); }
  if (problems.length === before) for (const p of f.patches) content = content.replace(toRegex(p.find), () => p.replace.join("\n"));
  results.push({ f, content, crlf });
}
if (problems.length) fail("verifier :\n  - " + problems.join("\n  - "));
for (const r of results) {
  for (const n of r.f.finals) if (!r.content.includes(n)) fail("controle final " + r.f.path + " : « " + n + " » absent apres patch.");
  for (const b of r.f.forbidden) if (r.content.includes(b)) fail("controle final " + r.f.path + " : « " + b + " » encore present apres patch.");
}
if (mode === "dry") { console.log("\nDRY-RUN termine : les " + FILES.length + " fichiers sont conformes. Rien n'a ete ecrit."); process.exit(0); }
for (const r of results) fs.writeFileSync(r.f.path, r.crlf ? r.content.replace(/\n/g, "\r\n") : r.content, "utf8");
console.log("\nCOMPLEMENT APPLIQUE : " + results.length + " fichiers modifies.");
console.log("Retour arriere : relancer depuis la version d'avant n'est pas possible sans commit ; reprendre les deux textes a la main si besoin.");
