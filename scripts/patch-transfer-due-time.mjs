// ============================================================
// PATCH — DATE ET HEURE DE L'ECHEANCE DU VIREMENT — ZENORIA_TRANSFER_DUE_TIME_V1
//
// Modifie : components/TransferInstructions.js (uniquement)
// Prerequis (fichier a copier AVANT, ce script ne le cree pas) :
//   lib/transferDueFormat.js
//
// Ce composant est deja partage entre la confirmation apres commande (pages/index.js) et le
// detail d'une commande dans Mon compte (pages/compte.js) : un seul patch s'applique aux deux.
// Remplace la date seule (« avant le 13/11/2026 ») par la date ET l'heure (« avant le 13/11/2026
// a 23 h 59 »), sans toucher au reste du texte ni du composant.
//
// Tout ou rien : chaque repere doit exister UNE SEULE fois, sinon rien n'est ecrit.
// Fins de ligne (CRLF/LF) conservees. Relancer apres succes est refuse.
//
// Usage : node scripts/patch-transfer-due-time.mjs
// ============================================================
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TAG = "[patch-transfer-due-time]";
const FILE = "components/TransferInstructions.js";
const MARKER = "ZENORIA_TRANSFER_DUE_TIME_V1";
const REQUIRED_NEW_FILE = "lib/transferDueFormat.js";

const edits = [
  {
    name: "import de la fonction de formatage",
    find: 'import { formatOrderPrice, formatOrderReference } from "@/lib/orderDisplay";',
    replace: [
      'import { formatOrderPrice, formatOrderReference } from "@/lib/orderDisplay";',
      'import { formatDueDateTime } from "@/lib/transferDueFormat"; // ZENORIA_TRANSFER_DUE_TIME_V1',
    ].join("\n"),
  },
  {
    name: "retrait de l'ancienne fonction (date seule, devenue inutile)",
    // Variante sans et avec ligne vide entre TIME_ZONE et formatDueDate : on essaie les deux.
    findVariants: [
      'const TIME_ZONE = "Europe/Paris";\nfunction formatDueDate(value) {\n  if (!value) return "—";\n  return new Date(value).toLocaleDateString("fr-FR", { timeZone: TIME_ZONE });\n}\nfunction groupIban(iban) {',
      'const TIME_ZONE = "Europe/Paris";\n\nfunction formatDueDate(value) {\n  if (!value) return "—";\n  return new Date(value).toLocaleDateString("fr-FR", { timeZone: TIME_ZONE });\n}\nfunction groupIban(iban) {',
    ],
    replace: ["function groupIban(iban) {"].join("\n"),
  },
  {
    name: "affichage de la date et de l'heure",
    find: "Merci d&apos;effectuer votre virement avant le <strong>{formatDueDate(data.due_at)}</strong>. Votre bijou vous est réservé jusqu&apos;à cette date. Au-delà, la commande sera annulée automatiquement.",
    replace: "Merci d&apos;effectuer votre virement avant le <strong>{formatDueDateTime(data.due_at)}</strong>. Votre bijou vous est réservé jusqu&apos;à cette date. Au-delà, la commande sera annulée automatiquement.",
  },
];

function countOccurrences(text, needle) {
  let n = 0;
  let i = text.indexOf(needle);
  while (i !== -1) {
    n += 1;
    i = text.indexOf(needle, i + needle.length);
  }
  return n;
}

const problems = [];
if (!fs.existsSync(path.join(ROOT, REQUIRED_NEW_FILE))) {
  problems.push(REQUIRED_NEW_FILE + " : fichier a copier avant de lancer ce script");
}

const full = path.join(ROOT, FILE);
let out = null;
let crlf = false;
if (!fs.existsSync(full)) {
  problems.push(FILE + " : fichier introuvable (lancer le script depuis le dossier du projet)");
} else {
  const raw = fs.readFileSync(full, "utf8");
  crlf = raw.includes("\r\n");
  let text = raw.replace(/\r\n/g, "\n");
  if (text.includes(MARKER)) {
    problems.push(FILE + " : deja patche (" + MARKER + " present), rien a faire");
  } else {
    let ok = true;
    const resolved = []; // { find, replace } effectivement retenu pour chaque edit
    for (const e of edits) {
      const variants = e.findVariants || [e.find];
      const counts = variants.map((v) => countOccurrences(text, v));
      const totalMatches = counts.filter((c) => c === 1).length;
      const totalOccurrences = counts.reduce((a, c) => a + c, 0);
      if (totalMatches !== 1 || totalOccurrences !== 1) {
        problems.push(FILE + " : repere \"" + e.name + "\" trouve " + totalOccurrences + " fois au total (attendu : 1 variante correspondant exactement une fois)");
        ok = false;
        continue;
      }
      const chosen = variants[counts.findIndex((c) => c === 1)];
      resolved.push({ find: chosen, replace: e.replace });
    }
    if (ok) {
      for (const e of resolved) text = text.replace(e.find, () => e.replace);
      out = crlf ? text.replace(/\n/g, "\r\n") : text;
    }
  }
}

if (problems.length > 0 || out === null) {
  console.error(TAG + " au moins un probleme, RIEN n a ete ecrit :");
  problems.forEach((p) => console.error("  - " + p));
  process.exit(1);
}

fs.writeFileSync(full, out, "utf8");
console.log(TAG + " 1 fichier mis a jour : " + FILE + " (" + (crlf ? "CRLF" : "LF") + ")");
