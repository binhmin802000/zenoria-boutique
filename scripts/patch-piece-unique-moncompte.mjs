// ZENORIA - Lot 4A-3 (Mon compte)
// ============================================================
// Ce script modifie UNIQUEMENT pages/compte.js, et seulement si TOUS
// les controles ci-dessous reussissent. Si un seul echoue, AUCUNE
// ecriture n'est faite (tout ou rien).
//
// Chantier :
//   A. Supprimer partout le bouton "Commander a nouveau" :
//      - le bouton lui-meme (data-testid="reorder-btn")
//      - la fonction reorder()
//      - les etats reorderBusyId / reorderMsg
//      - les props onReorder / reorderBusy / reorderMsg passees a OrderDetail
//      - le message de confirmation affiche sous le bouton
//      - l'import RotateCw devenu inutilise
//      - le commentaire obsolete qui y fait reference (ligne ~31)
//   B. Rendre le nom du bijou cliquable vers sa fiche (/#bague=<slug>),
//      uniquement si le produit existe encore et est actif. Sinon le
//      nom reste du texte simple (pas de lien mort).
//
// Usage :
//   node scripts/patch-piece-unique-moncompte.mjs --dry-run
//   node scripts/patch-piece-unique-moncompte.mjs --apply
// ============================================================

import fs from "node:fs";
import path from "node:path";

const apply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run");
if (!apply && !dryRun) {
  console.error("Utilisez --dry-run ou --apply.");
  process.exit(2);
}

const file = path.join(process.cwd(), "pages", "compte.js");
if (!fs.existsSync(file)) {
  console.error(`Fichier introuvable : ${file}`);
  console.error("Lancez ce script depuis la racine du projet (dossier zenoria).");
  process.exit(1);
}

const original = fs.readFileSync(file, "utf8");
const hasCRLF = /\r\n/.test(original);
const EOL = hasCRLF ? "\r\n" : "\n";

function fail(message) {
  console.error(`ECHEC : ${message}`);
  console.error("Aucune modification n'a ete ecrite.");
  process.exit(1);
}

function countSubstring(haystack, needle) {
  let count = 0, pos = 0;
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count++;
    pos += needle.length;
  }
  return count;
}

function linesContaining(lines, needle) {
  const idxs = [];
  lines.forEach((l, i) => { if (l.includes(needle)) idxs.push(i); });
  return idxs;
}

function deleteUniqueLine(lines, needle, label) {
  const idxs = linesContaining(lines, needle);
  if (idxs.length !== 1) {
    fail(`${label} : attendu 1 ligne contenant ${JSON.stringify(needle)}, trouve ${idxs.length}.`);
  }
  const idx = idxs[0];
  console.log(`OK repere : ${label} (ligne supprimee)`);
  return [...lines.slice(0, idx), ...lines.slice(idx + 1)];
}

function replaceOnUniqueLine(lines, searchNeedle, oldSubstr, newSubstr, label) {
  const idxs = linesContaining(lines, searchNeedle);
  if (idxs.length !== 1) {
    fail(`${label} : attendu 1 ligne contenant ${JSON.stringify(searchNeedle)}, trouve ${idxs.length}.`);
  }
  const idx = idxs[0];
  const occurrences = lines[idx].split(oldSubstr).length - 1;
  if (occurrences !== 1) {
    fail(`${label} : attendu 1 occurrence de ${JSON.stringify(oldSubstr)} sur la ligne reperee, trouve ${occurrences}.`);
  }
  lines[idx] = lines[idx].split(oldSubstr).join(newSubstr);
  console.log(`OK repere : ${label} (ligne modifiee)`);
  return lines;
}

function replaceUniqueLineWithLines(lines, searchNeedle, buildReplacement, label) {
  const idxs = linesContaining(lines, searchNeedle);
  if (idxs.length !== 1) {
    fail(`${label} : attendu 1 ligne contenant ${JSON.stringify(searchNeedle)}, trouve ${idxs.length}.`);
  }
  const idx = idxs[0];
  const indentMatch = lines[idx].match(/^(\s*)/);
  const indent = indentMatch ? indentMatch[1] : "";
  const replacement = buildReplacement(indent);
  console.log(`OK repere : ${label} (ligne remplacee par ${replacement.length} lignes)`);
  return [...lines.slice(0, idx), ...replacement, ...lines.slice(idx + 1)];
}

function removeFunctionBlock(lines, startNeedle, sanityNeedles, label) {
  const idxs = linesContaining(lines, startNeedle);
  if (idxs.length !== 1) {
    fail(`${label} : attendu 1 ligne contenant ${JSON.stringify(startNeedle)}, trouve ${idxs.length}.`);
  }
  const startIdx = idxs[0];
  let depth = 0;
  let endIdx = -1;
  for (let i = startIdx; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
    }
    if (depth === 0 && i > startIdx) {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) {
    fail(`${label} : fin de bloc introuvable (comptage d'accolades depuis la ligne ${startIdx + 1}).`);
  }
  const block = lines.slice(startIdx, endIdx + 1).join("\n");
  const missing = sanityNeedles.filter((n) => !block.includes(n));
  if (missing.length > 0) {
    fail(`${label} : contenu inattendu entre les lignes ${startIdx + 1} et ${endIdx + 1}, elements manquants : ${missing.join(", ")}.`);
  }
  console.log(`OK repere : ${label} (bloc lignes ${startIdx + 1} a ${endIdx + 1} supprime)`);
  return [...lines.slice(0, startIdx), ...lines.slice(endIdx + 1)];
}

function removeBlockByOpenClose(lines, openNeedle, closeTrim, maxWindow, sanityNeedles, label) {
  const idxs = linesContaining(lines, openNeedle);
  if (idxs.length !== 1) {
    fail(
      `${label} : attendu 1 ligne contenant ${JSON.stringify(openNeedle)}, trouve ${idxs.length}. ` +
      "(Si 0, ce chantier a peut-etre deja ete applique.)"
    );
  }
  const openIdx = idxs[0];
  let closeIdx = -1;
  for (let i = openIdx; i < Math.min(lines.length, openIdx + maxWindow); i++) {
    if (lines[i].trim() === closeTrim) {
      closeIdx = i;
      break;
    }
  }
  if (closeIdx === -1) {
    fail(`${label} : fermeture ${JSON.stringify(closeTrim)} introuvable dans les ${maxWindow} lignes suivant la ligne ${openIdx + 1}.`);
  }
  const block = lines.slice(openIdx, closeIdx + 1).join("\n");
  const missing = sanityNeedles.filter((n) => !block.includes(n));
  if (missing.length > 0) {
    fail(`${label} : contenu inattendu entre les lignes ${openIdx + 1} et ${closeIdx + 1}, elements manquants : ${missing.join(", ")}.`);
  }
  console.log(`OK repere : ${label} (bloc lignes ${openIdx + 1} a ${closeIdx + 1} supprime)`);
  return [...lines.slice(0, openIdx), ...lines.slice(closeIdx + 1)];
}

// ------------------------------------------------------------
// Preparation
// ------------------------------------------------------------
let lines = original.split(/\r\n|\n/);

// ------------------------------------------------------------
// A0 — Corriger le commentaire obsolete (ligne ~31) qui mentionne
// "Commander a nouveau" comme reference de principe pour les favoris.
// On le reformule pour qu'il reste correct sans ce bouton.
// ------------------------------------------------------------
lines = replaceOnUniqueLine(
  lines,
  "suit le même principe que « Commander à nouveau »",
  "suit le même principe que « Commander à nouveau » (panier existant, puis",
  "suit un principe similaire d'ajout au panier existant (puis",
  "commentaire obsolete (ligne ~31)"
);

// ------------------------------------------------------------
// A1 — Import RotateCw devenu inutile
// ------------------------------------------------------------
lines = replaceOnUniqueLine(
  lines,
  'from "lucide-react"',
  "RotateCw, ",
  "",
  "import RotateCw (devient inutilise)"
);

// ------------------------------------------------------------
// A2 — Etats reorderBusyId / reorderMsg
// ------------------------------------------------------------
lines = deleteUniqueLine(
  lines,
  "const [reorderBusyId, setReorderBusyId] = useState(null);",
  "etat reorderBusyId"
);
lines = deleteUniqueLine(
  lines,
  'const [reorderMsg, setReorderMsg] = useState("");',
  "etat reorderMsg"
);

// ------------------------------------------------------------
// A3 — Fonction reorder() entiere
// ------------------------------------------------------------
lines = removeFunctionBlock(
  lines,
  "const reorder = (order) => {",
  [
    "setReorderBusyId(order.id)",
    "CART_STORAGE_KEY",
    "unavailable",
    "setReorderBusyId(null)",
  ],
  "fonction reorder()"
);

// ------------------------------------------------------------
// A4 — Nettoyage de setReorderMsg("") restant (dans go())
// ------------------------------------------------------------
lines = deleteUniqueLine(
  lines,
  'setReorderMsg("");',
  "setReorderMsg(\"\") residuel dans go()"
);

// ------------------------------------------------------------
// A5 — Signature de OrderDetail
// ------------------------------------------------------------
lines = replaceOnUniqueLine(
  lines,
  "function OrderDetail({",
  ", onReorder, reorderBusy, reorderMsg",
  "",
  "signature OrderDetail (props reorder retirees)"
);

// ------------------------------------------------------------
// A6 — Message de confirmation
// ------------------------------------------------------------
lines = deleteUniqueLine(
  lines,
  "{reorderMsg && <div",
  "message de confirmation reorderMsg (JSX)"
);

// ------------------------------------------------------------
// A7 — Le bouton lui-meme
// ------------------------------------------------------------
lines = removeBlockByOpenClose(
  lines,
  'data-testid="reorder-btn"',
  "</button>",
  6,
  ["Commander à nouveau", "onReorder(order)", "RotateCw"],
  'bouton "Commander a nouveau"'
);

// ------------------------------------------------------------
// B1 — Nom du bijou cliquable
// ------------------------------------------------------------
lines = replaceUniqueLineWithLines(
  lines,
  '<div className="text-sm font-medium text-[#412f3b] truncate">{it.product_name}</div>',
  (indent) => [
    `${indent}{it.product && it.product.active && it.product.slug ? (`,
    `${indent}  <a href={\`/#bague=${"$"}{encodeURIComponent(it.product.slug)}\`} className="text-sm font-medium text-[#412f3b] truncate hover:underline block">{it.product_name}</a>`,
    `${indent}) : (`,
    `${indent}  <div className="text-sm font-medium text-[#412f3b] truncate">{it.product_name}</div>`,
    `${indent})}`,
  ],
  "nom du bijou (lien vers la fiche)"
);

// ------------------------------------------------------------
// A8 — Props de l'appel a OrderDetail
// ------------------------------------------------------------
lines = deleteUniqueLine(lines, "onReorder={reorder}", "prop onReorder (appel OrderDetail)");
lines = deleteUniqueLine(lines, "reorderBusy={reorderBusyId === selectedOrder.id}", "prop reorderBusy (appel OrderDetail)");
lines = deleteUniqueLine(lines, "reorderMsg={reorderMsg}", "prop reorderMsg (appel OrderDetail)");

// ------------------------------------------------------------
// Garde-fous finaux
// ------------------------------------------------------------
let text = lines.join(EOL);

const mustBeAbsent = [
  "reorder-btn",
  "onReorder",
  "reorderBusy",
  "reorderMsg",
  "RotateCw",
  "Commander à nouveau",
];
for (const needle of mustBeAbsent) {
  const n = countSubstring(text, needle);
  if (n !== 0) {
    fail(`garde-fou final : ${JSON.stringify(needle)} devrait avoir disparu, encore trouve ${n} fois.`);
  }
}
console.log("OK garde-fou : plus aucune trace de reorder-btn / onReorder / reorderBusy / reorderMsg / RotateCw / \"Commander à nouveau\" (y compris commentaires)");

const bagueLinkCount = countSubstring(text, "/#bague=");
if (bagueLinkCount < 1) {
  fail('garde-fou final : aucun lien "/#bague=" trouve apres modification.');
}
console.log(`OK garde-fou : lien vers la fiche produit present (${bagueLinkCount} occurrence(s) de "/#bague=")`);

// ------------------------------------------------------------
// Resultat
// ------------------------------------------------------------
if (text === original) {
  fail("aucune modification produite malgre les controles reussis (cas inattendu).");
}

console.log("");
console.log(`Mode : ${dryRun ? "DRY-RUN" : "APPLY"}`);
console.log("Tous les controles sont conformes.");
console.log("Modifications preparees :");
console.log('  - Suppression complete du bouton "Commander a nouveau" (bouton, fonction, etats, props, message, import, commentaire)');
console.log("  - Nom du bijou cliquable vers sa fiche (/#bague=<slug>), uniquement si le produit existe et est actif");

if (dryRun) {
  console.log("");
  console.log("VERIFICATION SEULE : aucun fichier modifie.");
} else {
  fs.writeFileSync(file, text, "utf8");
  console.log("");
  console.log(`Fichier modifie : ${path.relative(process.cwd(), file)}`);
}