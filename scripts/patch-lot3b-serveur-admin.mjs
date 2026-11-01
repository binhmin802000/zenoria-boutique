#!/usr/bin/env node
// ============================================================
// PATCH LOT 3b : etape 3 du virement - serveur et admin
// Fichiers modifies (aucun autre, aucune base de donnees) :
//   pages/api/checkout-transfer.js  coordonnees bancaires incompletes refusees (503) ; PIECE_UNAVAILABLE en 409 (code + productIds) ; codes inconnus journalises
//   lib/paymentSettings.js          le BIC n'est plus liste comme manquant ; commentaire a jour
//   components/AdminCrm.js          note facultative a la prolongation ; mention « visible par la cliente » ; repere des lignes visibles dans le journal
// Prerequis : lots 3a et 3a-bis appliques en base (admin_extend_transfer a trois parametres, colonne customer_visible).
//
// Usage, depuis la racine du projet (dossier zenoria) :
//   node scripts/patch-lot3b-serveur-admin.mjs --dry-run   -> controle chaque repere, n'ecrit RIEN
//   node scripts/patch-lot3b-serveur-admin.mjs --apply     -> ecrit les 3 fichiers si TOUT est conforme
// Garde-fous : rien n'est ecrit si un repere est absent ou en double, ou si le patch est deja applique.
// ============================================================
import fs from "node:fs";

const MARKER = "ZENORIA_STEP3B_V1";
const mode = process.argv.includes("--apply") ? "apply" : process.argv.includes("--dry-run") ? "dry" : null;
const FILES = [
 {
  "path": "lib/paymentSettings.js",
  "patches": [
   {
    "name": "P1 commentaire : l'IBAN est servi par la fonction SQL du lot 3a",
    "find": [
     "//     Jamais dans la lecture publique : elle sera servie par une route serveur, uniquement à la",
     "//     cliente propriétaire de la commande."
    ],
    "replace": [
     "//     Jamais dans la lecture publique : elle est servie par la fonction SQL customer_transfer_instructions (lot 3a), uniquement à la",
     "//     cliente propriétaire d'une commande encore en attente de virement. // ZENORIA_STEP3B_V1"
    ]
   },
   {
    "name": "P2 le BIC est facultatif (plus listé comme manquant)",
    "find": [
     "if (!normalizeBic(b.bic)) missing.push(\"BIC\");"
    ],
    "replace": [
     "// le BIC est facultatif : un virement SEPA en France n'exige que l'IBAN (le champ reste proposé dans l'admin)"
    ]
   }
  ],
  "finals": [
   "customer_transfer_instructions",
   "le BIC est facultatif",
   "ZENORIA_STEP3B_V1"
  ],
  "forbidden": [
   "missing.push(\"BIC\")",
   "servie par une route serveur"
  ]
 },
 {
  "path": "pages/api/checkout-transfer.js",
  "patches": [
   {
    "name": "T1 import : controle des coordonnees bancaires",
    "find": [
     "import { isTestOrderMode } from \"@/lib/testMode\";"
    ],
    "replace": [
     "import { BANK_TRANSFER_KEY, parseBankTransfer, isTransferReady } from \"@/lib/paymentSettings\"; // ZENORIA_STEP3B_V1 : coordonnées bancaires complètes avant toute commande",
     "import { isTestOrderMode } from \"@/lib/testMode\";"
    ]
   },
   {
    "name": "T2 table d'erreurs : PIECE_UNAVAILABLE (409)",
    "find": [
     "PRODUCT_UNAVAILABLE: { status: 409, message: \"Un article de votre panier n§APOS§est plus disponible.\" },"
    ],
    "replace": [
     "PRODUCT_UNAVAILABLE: { status: 409, message: \"Un article de votre panier n'est plus disponible.\" },",
     "    PIECE_UNAVAILABLE: { status: 409, message: \"Une pièce unique de votre panier vient d'être réservée ou vendue. Retirez-la de votre panier pour continuer. Si cette bague vous intéresse, écrivez-nous.\" },"
    ]
   },
   {
    "name": "T3 coordonnees bancaires incompletes : refus avant toute creation (503)",
    "find": [
     "const isTest = isTestOrderMode();"
    ],
    "replace": [
     "// ZENORIA_STEP3B_V1 : les coordonnées bancaires doivent être complètes AVANT de créer la commande (et de réserver une pièce).",
     "    // L'administration bloque déjà l'activation sans IBAN valide ; ce contrôle protège d'un réglage modifié autrement (SQL) ou vidé après coup.",
     "    let bankReady = false;",
     "    try {",
     "      const { data: bankRow, error: bankErr } = await supabaseAdmin.from(SITE_SETTINGS_TABLE).select(\"value\").eq(\"key\", BANK_TRANSFER_KEY).maybeSingle();",
     "      if (!bankErr && bankRow) bankReady = isTransferReady(parseBankTransfer(bankRow.value));",
     "    } catch (bankCatchErr) {",
     "      console.error(\"[checkout-transfer] lecture des coordonnées bancaires :\", bankCatchErr && bankCatchErr.message ? bankCatchErr.message : \"erreur\");",
     "    }",
     "    if (!bankReady) {",
     "      return res.status(503).json({ ok: false, error: \"Le paiement par virement n'est pas disponible pour le moment. Vous pouvez payer par carte.\" });",
     "    }",
     "    const isTest = isTestOrderMode();"
    ]
   },
   {
    "name": "T4 erreur de la fonction SQL : code, identifiants des pieces, journal des codes inconnus",
    "find": [
     "const { status, message } = errorForCode(rpcError.message);",
     "return res.status(status).json({ ok: false, error: message });"
    ],
    "replace": [
     "// ZENORIA_STEP3B_V1 : code d'erreur de la fonction SQL (ex. « PIECE_UNAVAILABLE:18,21 ») ; les codes inconnus sont journalisés (code seulement, sans donnée personnelle)",
     "      const rawMessage = String(rpcError.message || \"\");",
     "      const { status, message } = errorForCode(rawMessage);",
     "      const errorCode = rawMessage.split(\":\")[0].trim();",
     "      const body = { ok: false, error: message };",
     "      if (errorCode === \"PIECE_UNAVAILABLE\") {",
     "        body.code = errorCode;",
     "        body.productIds = (rawMessage.split(\":\")[1] || \"\").split(\",\").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0);",
     "      }",
     "      if (status >= 500) {",
     "        console.error(\"[checkout-transfer] erreur non traduite de create_transfer_order :\", errorCode.slice(0, 80) || \"(sans code)\", rpcError.code || \"\");",
     "      }",
     "      return res.status(status).json(body);"
    ]
   }
  ],
  "finals": [
   "isTransferReady(parseBankTransfer",
   "body.productIds",
   "ZENORIA_STEP3B_V1",
   "res.status(503)"
  ],
  "forbidden": [
   "errorForCode(rpcError.message)"
  ]
 },
 {
  "path": "components/AdminCrm.js",
  "patches": [
   {
    "name": "A1 prolongation : note facultative envoyee a la fonction SQL",
    "find": [
     "call = () => supabase.rpc(\"admin_extend_transfer\", { p_order_id: order.id, p_days: n });"
    ],
    "replace": [
     "call = () => supabase.rpc(\"admin_extend_transfer\", { p_order_id: order.id, p_days: n, p_note: note.trim() || null }); // ZENORIA_STEP3B_V1 : note facultative, visible par la cliente"
    ]
   },
   {
    "name": "A2 prolongation : champ de note",
    "find": [
     "data-testid=\"transfer-days\" className={field + \" w-28\"} /></label>"
    ],
    "replace": [
     "data-testid=\"transfer-days\" className={field + \" w-28\"} /></label>",
     "          <label className=\"block text-[12px] text-[#54434c]\">Note pour la cliente (facultative)<br /><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} data-testid=\"transfer-extend-note\" className={field + \" w-full\"} /></label>",
     "          <p className=\"text-[11px] text-[#8b737e]\">Cette note sera visible par la cliente.</p>"
    ]
   },
   {
    "name": "A3 confirmation : mention de visibilite",
    "find": [
     "{gap ? \"Note (obligatoire : le montant diffère du total)\" : \"Note (facultative)\"}"
    ],
    "replace": [
     "{gap ? \"Note visible par la cliente (obligatoire : le montant diffère du total)\" : \"Note visible par la cliente (facultative)\"}"
    ]
   },
   {
    "name": "A4 annulation : mention de visibilite",
    "find": [
     "{reason === \"other\" ? \"Note (obligatoire)\" : \"Note (facultative)\"}"
    ],
    "replace": [
     "{reason === \"other\" ? \"Note visible par la cliente (obligatoire)\" : \"Note visible par la cliente (facultative)\"}"
    ]
   },
   {
    "name": "A5 journal : repere des lignes visibles par la cliente",
    "find": [
     "{h.note && <span className=\"block mt-1 leading-5\">{h.note}</span>}"
    ],
    "replace": [
     "{h.note && <span className=\"block mt-1 leading-5\">{h.note}</span>}",
     "                  {h.customer_visible && <span data-testid=\"order-history-visible\" className=\"block text-[11px] text-[#8f6075]\">Visible par la cliente</span>}"
    ]
   },
   {
    "name": "A6 carte d'annulation : la raison indiquee par la cliente est affichee",
    "find": [
     "\"Motif : \") : \"\";"
    ],
    "replace": [
     "\"Motif : \").replace(/^Annulée par la cliente depuis Mes commandes\\.\\s*/i, \"\") : \"\";"
    ]
   }
  ],
  "finals": [
   "p_note: note.trim() || null }); // ZENORIA_STEP3B_V1",
   "transfer-extend-note",
   "h.customer_visible",
   "Note visible par la cliente (facultative)"
  ],
  "forbidden": [
   "\"Note (facultative)\"",
   "\"Note (obligatoire)\"",
   "{ p_order_id: order.id, p_days: n }"
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
// Les lignes d'un repere sont comparees sans tenir compte des espaces/fins de ligne ; §APOS§ accepte ' ou &apos; ou l'apostrophe typographique.
const toRegex = (lines) =>
  new RegExp(escapeRegex(lines.map((l) => l.trim()).join("\n")).replace(/\s+/g, "\\s+").split("§APOS§").join("(?:&apos;|'|\u2019)"), "g");

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
  console.log("Etape suivante : node scripts/patch-lot3b-serveur-admin.mjs --apply");
  process.exit(0);
}
for (const r of results) fs.writeFileSync(r.f.path, r.crlf ? r.content.replace(/\n/g, "\r\n") : r.content, "utf8");
console.log("\nPATCH APPLIQUE : " + results.length + " fichiers modifies.");
console.log("Etapes suivantes : git diff --stat, puis npm run build, puis npm run dev.");
console.log("Retour arriere avant commit : git restore pages/api/checkout-transfer.js lib/paymentSettings.js components/AdminCrm.js");
