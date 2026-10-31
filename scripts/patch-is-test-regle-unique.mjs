#!/usr/bin/env node
// ============================================================
// PATCH « REGLE UNIQUE is_test » : une commande est de TEST tant que la cle Stripe n'est pas en mode reel (carte ET virement)
// Cree     : lib/testMode.js
// Modifie  : pages/api/checkout-transfer.js (1 ligne + import), pages/api/checkout.js (1 ligne + import)
// Aucune base de donnees, aucun autre fichier. Le webhook Stripe n'est PAS modifie (a verifier separement).
//
// Usage, depuis la racine du projet (dossier zenoria) :
//   node scripts/patch-is-test-regle-unique.mjs --dry-run   -> controle chaque repere, n'ecrit RIEN
//   node scripts/patch-is-test-regle-unique.mjs --apply     -> ecrit si TOUT est conforme
// Garde-fous : rien n'est ecrit si un repere est absent ou en double, si lib/testMode.js existe deja, ou si le patch est deja applique.
// ============================================================
import fs from "node:fs";

const MARKER = "ZENORIA_TEST_MODE_V1";
const mode = process.argv.includes("--apply") ? "apply" : process.argv.includes("--dry-run") ? "dry" : null;
const FILES = [
 {
  "path": "lib/testMode.js",
  "kind": "create",
  "content": "// ZENORIA_TEST_MODE_V1\n// ============================================================\n// lib/testMode.js\n//\n// REGLE UNIQUE : une commande est une commande de TEST tant que la cle secrete Stripe n'est pas une cle du mode REEL (sk_live_).\n// Utilisee par TOUTES les routes qui creent une commande :\n//   - pages/api/checkout.js           (paiement par carte)\n//   - pages/api/checkout-transfer.js  (paiement par virement)\n// Avant ce fichier, le virement decidait d'apres l'environnement de deploiement : une commande passee sur le site de production\n// etait donc enregistree « reelle » alors que Stripe etait encore en mode test (commande 121 du 31/10/2026).\n// Effet voulu : UN SEUL interrupteur. Quand la cle live est mise en production (etape d'activation), carte ET virement passent ensemble\n// en commandes reelles ; tant que la cle est une cle de test, aucune commande reelle ne peut etre creee, ni par carte, ni par virement.\n// Cle absente ou illisible : commande de TEST (le cas sur est de ne jamais creer une vraie commande par erreur).\n// ============================================================\nexport function isTestOrderMode(secretKey = process.env.STRIPE_SECRET_KEY) {\n  return !String(secretKey || \"\").startsWith(\"sk_live_\");\n}\n",
  "finals": [
   "export function isTestOrderMode",
   "ZENORIA_TEST_MODE_V1"
  ],
  "forbidden": []
 },
 {
  "path": "pages/api/checkout-transfer.js",
  "kind": "anchors",
  "patches": [
   {
    "name": "T1 import de la regle unique",
    "find": [
     "import { computeTotals, effectivePrice } from \"@/lib/cartTotals\";"
    ],
    "replace": [
     "import { computeTotals, effectivePrice } from \"@/lib/cartTotals\";",
     "import { isTestOrderMode } from \"@/lib/testMode\"; // ZENORIA_TEST_MODE_V1 : règle unique « commande de test » (carte et virement)"
    ]
   },
   {
    "name": "T2 is_test du virement : meme regle que la carte",
    "find": [
     "const isTest = (process.env.VERCEL_ENV || process.env.NODE_ENV || \"development\") !== \"production\";"
    ],
    "replace": [
     "const isTest = isTestOrderMode(); // ZENORIA_TEST_MODE_V1 : commande de test tant que la clé Stripe n'est pas en mode réel (comme la carte), et non d'après l'environnement de déploiement"
    ]
   }
  ],
  "finals": [
   "isTestOrderMode()",
   "from \"@/lib/testMode\""
  ],
  "forbidden": [
   "VERCEL_ENV",
   "NODE_ENV"
  ]
 },
 {
  "path": "pages/api/checkout.js",
  "kind": "anchors",
  "patches": [
   {
    "name": "C1 import de la regle unique",
    "find": [
     "import { computeTotals, effectivePrice } from \"@/lib/cartTotals\";"
    ],
    "replace": [
     "import { computeTotals, effectivePrice } from \"@/lib/cartTotals\";",
     "import { isTestOrderMode } from \"@/lib/testMode\"; // ZENORIA_TEST_MODE_V1 : règle unique « commande de test » (carte et virement)"
    ]
   },
   {
    "name": "C2 is_test de la carte : meme regle que le virement",
    "find": [
     "is_test: !String(process.env.STRIPE_SECRET_KEY || \"\").startsWith(\"sk_live_\"),"
    ],
    "replace": [
     "is_test: isTestOrderMode(), // ZENORIA_TEST_MODE_V1 : règle unique avec le virement (lib/testMode.js)"
    ]
   }
  ],
  "finals": [
   "is_test: isTestOrderMode()",
   "from \"@/lib/testMode\""
  ],
  "forbidden": [
   ".startsWith(\"sk_live_\")"
  ]
 }
];

function fail(message) {
  console.error("\nECHEC : " + message);
  console.error("Aucun fichier n'a ete modifie.");
  process.exit(1);
}
if (!mode) fail("indiquez --dry-run ou --apply.");

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const toRegex = (lines) => new RegExp(escapeRegex(lines.map((l) => l.trim()).join("\n")).replace(/\s+/g, "\\s+"), "g");

console.log("Mode : " + (mode === "apply" ? "APPLICATION" : "DRY-RUN (aucune ecriture)") + "\n");
const results = [];
const problems = [];

for (const f of FILES) {
  if (f.kind === "create") {
    const exists = fs.existsSync(f.path);
    console.log(f.path + " (nouveau fichier)");
    console.log((exists ? " ERREUR " : "  OK  ") + "le fichier n'existe pas encore");
    if (exists) problems.push(f.path + " existe deja");
    if (!fs.existsSync("lib")) problems.push("dossier lib introuvable : lancez la commande depuis la racine du projet (dossier zenoria)");
    results.push({ f, content: f.content, crlf: false, create: true });
    continue;
  }
  if (!fs.existsSync(f.path)) fail(f.path + " est introuvable. Lancez la commande depuis la racine du projet (dossier zenoria).");
  const original = fs.readFileSync(f.path, "utf8");
  const crlf = original.includes("\r\n");
  let content = original.replace(/\r\n/g, "\n");
  console.log(f.path + " (fins de ligne " + (crlf ? "Windows CRLF" : "Unix LF") + ")");
  if (content.includes(MARKER)) fail(f.path + " : le patch est deja applique (marqueur " + MARKER + " present).");
  for (const p of f.patches) {
    const count = (content.match(toRegex(p.find)) || []).length;
    console.log((count === 1 ? "  OK  " : " ERREUR ") + p.name + " : " + count + " occurrence(s)");
    if (count !== 1) problems.push(f.path + " : " + p.name + " (" + count + " occurrence(s) au lieu de 1)");
  }
  if (problems.length === 0) for (const p of f.patches) content = content.replace(toRegex(p.find), () => p.replace.join("\n"));
  results.push({ f, content, crlf });
}
if (problems.length > 0) fail("verifier :\n  - " + problems.join("\n  - "));

for (const r of results) {
  for (const needle of r.f.finals) if (!r.content.includes(needle)) fail("controle final " + r.f.path + " : « " + needle + " » absent apres patch.");
  for (const bad of r.f.forbidden) if (r.content.includes(bad)) fail("controle final " + r.f.path + " : « " + bad + " » est toujours present apres patch.");
}
if (mode === "dry") {
  console.log("\nDRY-RUN termine : les " + FILES.length + " fichiers sont conformes. Rien n'a ete ecrit.");
  console.log("Etape suivante : node scripts/patch-is-test-regle-unique.mjs --apply");
  process.exit(0);
}
for (const r of results) fs.writeFileSync(r.f.path, r.crlf ? r.content.replace(/\n/g, "\r\n") : r.content, "utf8");
console.log("\nPATCH APPLIQUE : " + results.length + " fichiers (1 cree, 2 modifies).");
console.log("Etapes suivantes : git status --short, puis npm run build.");
console.log("Retour arriere avant commit : git restore pages/api/checkout.js pages/api/checkout-transfer.js, puis supprimer lib/testMode.js");
