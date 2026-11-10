#!/usr/bin/env node
// ============================================================
// patch-hand-delivery.mjs
// ZENORIA_HAND_DELIVERY_V1
//
// Ajoute le mode d'expedition « En main propre » (admin > CRM > Commandes > Parcours d'une commande).
//
//  - Le transporteur « En main propre » s'ajoute a la liste. Aucune colonne ni script SQL : orders.carrier recoit
//    « En main propre », orders.tracking_number recoit la NOTE (facultative, visible par la cliente).
//  - Formulaire admin : pour « En main propre », le champ devient « Note (facultatif, visible par la cliente) »
//    (200 caracteres max). Pour les autres transporteurs : « Numero de suivi », obligatoire, 60 caracteres max (inchange).
//  - Admin : le bloc d'expedition suit desormais le TRANSPORTEUR (toujours renseigne) et non le numero de suivi
//    (facultatif en main propre). Sans cela, le formulaire resterait ouvert apres une remise sans note.
//  - Mon compte : « Remise en main propre » + icone main + note ; les autres transporteurs s'affichent comme avant.
//  - Route serveur (update-status.js) : « En main propre » est une valeur autorisee ; la note n'est obligatoire que pour
//    les autres transporteurs. Controle fait cote serveur, pas seulement dans le formulaire.
//  - Facture PDF : pour « En main propre », ni transporteur ni note ne sont imprimes (une note sous l'intitule
//    « N° de suivi » serait trompeuse) ; la facture suit le chemin « sans information d'expedition » deja utilise.
//
// Fichiers modifies (TOUT OU RIEN : si une ancre ne correspond pas, aucun fichier n'est ecrit) :
//   pages/api/admin/orders/update-status.js · components/AdminCrm.js · pages/compte.js · pages/api/invoice/[orderId].js
//
// Usage : node scripts/patch-hand-delivery.mjs
// ============================================================
import fs from "node:fs";
import path from "node:path";

const MARK = "ZENORIA_HAND_DELIVERY_V1";
const HAND = "En main propre";

const FILES = [
  {
    key: "serveur",
    file: path.join("pages", "api", "admin", "orders", "update-status.js"),
    edits: [
      {
        label: "liste des transporteurs autorises",
        re: /const ALLOWED_CARRIERS = \[([^\]]*)\];/g,
        to: (m, inner) =>
          `const HAND_CARRIER = "${HAND}"; // ${MARK}\n` +
          `const MAX_HAND_NOTE_LENGTH = 200; // ${MARK} : longueur max de la note (facultative) d'une remise en main propre\n` +
          `const ALLOWED_CARRIERS = [${inner}, HAND_CARRIER];`,
      },
      {
        label: "numero de suivi obligatoire sauf en main propre",
        re: /if \(!trimmedTracking\) \{/g,
        to: () => `if (!trimmedTracking && carrier !== HAND_CARRIER) { // ${MARK} : la note est facultative en main propre`,
      },
      {
        label: "longueur maximale selon le transporteur",
        re: /if \(trimmedTracking\.length > MAX_TRACKING_LENGTH\) \{/g,
        to: () => `if (trimmedTracking.length > (carrier === HAND_CARRIER ? MAX_HAND_NOTE_LENGTH : MAX_TRACKING_LENGTH)) {`,
      },
      {
        label: "enregistrement : note vide = NULL",
        re: /tracking_number: trimmedTracking,/g,
        to: () => `tracking_number: trimmedTracking || null, // ${MARK} : note vide en main propre -> NULL`,
      },
      {
        label: "texte du journal de commande",
        re: /note: "[^"\n]*" \+ carrier \+ "[^"\n]*" \+ trimmedTracking \+ "\.",/g,
        to: (m) =>
          `note: carrier === HAND_CARRIER ? "Remise en main propre" + (trimmedTracking ? " : " + trimmedTracking : "") + "." : ` +
          m.slice("note: ".length),
      },
    ],
    final: (s) => [
      [s.includes('carrier !== HAND_CARRIER'), "note obligatoire seulement hors main propre"],
      [s.includes("HAND_CARRIER];"), "main propre dans la liste autorisee"],
      [s.includes("trimmedTracking || null"), "note vide enregistree en NULL"],
      [s.includes("Remise en main propre"), "texte du journal"],
    ],
  },
  {
    key: "admin",
    file: path.join("components", "AdminCrm.js"),
    edits: [
      {
        label: "liste CARRIERS",
        re: /const CARRIERS = \[([^\]]*)\];/g,
        to: (m, inner) => `const CARRIERS = [${inner}, "${HAND}"]; // ${MARK}\n  const HAND_CARRIER = "${HAND}"; // ${MARK}`,
      },
      {
        label: "le bloc d'expedition suit le transporteur",
        re: /\{o\.tracking_number \? \(/g,
        to: () => `{o.carrier ? ( /* ${MARK} : le bloc suit le transporteur (toujours renseigne), pas la note/numero (facultatif en main propre) */`,
      },
      {
        label: "affichage : note en main propre, suivi sinon",
        re: /\{o\.carrier\} (\S+) Suivi : <strong>\{o\.tracking_number\}<\/strong>/g,
        to: (m, dot) =>
          `{o.carrier === HAND_CARRIER ? (\n` +
          `                              <>{o.carrier}{o.tracking_number && <> ${dot} Note : <strong>{o.tracking_number}</strong></>}</>\n` +
          `                            ) : (\n` +
          `                              <>{o.carrier} ${dot} Suivi : <strong>{o.tracking_number}</strong></>\n` +
          `                            )}`,
      },
      {
        label: "champ de saisie : note ou numero de suivi",
        re: /^([ \t]*)placeholder="Num\S+ro de suivi"/gm,
        to: (m, indent) =>
          `${indent}placeholder={((shippingDraft[o.id] || {}).carrier || CARRIERS[0]) === HAND_CARRIER ? "Note (facultatif, visible par la cliente)" : "Num\u00e9ro de suivi"}\n` +
          `${indent}maxLength={((shippingDraft[o.id] || {}).carrier || CARRIERS[0]) === HAND_CARRIER ? 200 : 60}`,
      },
      {
        label: "bouton desactive des que le transporteur est enregistre",
        re: /Boolean\(o\.tracking_number\)/g,
        to: () => `Boolean(o.carrier)`,
      },
    ],
    final: (s) => [
      [s.includes("{o.carrier ? ("), "bloc d'expedition base sur le transporteur"],
      [s.includes("Boolean(o.carrier)"), "bouton base sur le transporteur"],
      [!s.includes("Boolean(o.tracking_number)"), "ancienne condition retiree"],
      [(s.match(/const HAND_CARRIER =/g) || []).length === 1, "HAND_CARRIER defini une seule fois"],
    ],
  },
  {
    key: "compte",
    file: path.join("pages", "compte.js"),
    edits: [
      {
        label: "icone main (import lucide)",
        re: /\bTruck, ChevronLeft\b/g,
        to: () => `Truck, Hand as HandIcon, ChevronLeft`,
      },
      {
        label: "icone et libelle du mode d'expedition",
        re: /<Truck size=\{16\} className="text-\[#8f6075\]" \/> \{order\.carrier\}/g,
        to: () =>
          `{order.carrier === "${HAND}" ? <HandIcon size={16} className="text-[#8f6075]" /> : <Truck size={16} className="text-[#8f6075]" />} ` +
          `{order.carrier === "${HAND}" ? "Remise en main propre" : order.carrier} {/* ${MARK} */}`,
      },
      {
        label: "note ou numero de suivi",
        re: /\{order\.tracking_number && <span className="text-\[#8b737e\]">(\S+) suivi \{order\.tracking_number\}<\/span>\}/g,
        to: (m, dot) =>
          `{order.tracking_number && <span className="text-[#8b737e] min-w-0 break-words">${dot} {order.carrier === "${HAND}" ? "" : "suivi "}{order.tracking_number}</span>}`,
      },
    ],
    final: (s) => [
      [(s.match(/HandIcon/g) || []).length >= 2, "icone main utilisee"],
      [s.includes("Remise en main propre"), "libelle cote cliente"],
      [s.includes('"suivi "'), "libelle suivi conserve pour les autres transporteurs"],
    ],
  },
  {
    key: "facture",
    file: path.join("pages", "api", "invoice", "[orderId].js"),
    edits: [
      {
        label: "facture : pas de transporteur en main propre",
        re: /carrier: invoice\.delivery_carrier \|\| null,/g,
        to: () => `carrier: invoice.delivery_carrier === "${HAND}" ? null : invoice.delivery_carrier || null,`,
      },
      {
        label: "facture : pas de note presentee comme numero de suivi",
        re: /trackingNumber: invoice\.delivery_tracking_number \|\| null,/g,
        to: () => `trackingNumber: invoice.delivery_carrier === "${HAND}" ? null : invoice.delivery_tracking_number || null, // ${MARK} : la note d'une remise en main propre n'est pas un numero de suivi`,
      },
    ],
    final: (s) => [[(s.match(/En main propre/g) || []).length === 2, "deux gardes sur la facture"]],
  },
];

function fail(message) {
  console.error(`[patch-hand-delivery] ${message}`);
  process.exit(1);
}

// ---- lecture de tous les fichiers ----
const loaded = FILES.map((f) => {
  const abs = path.join(process.cwd(), f.file);
  if (!fs.existsSync(abs)) fail(`fichier introuvable : ${f.file} (lancez le script depuis la racine du projet). Rien n'a ete ecrit.`);
  const original = fs.readFileSync(abs, "utf8");
  return { ...f, abs, original, crlf: original.includes("\r\n"), text: original.replace(/\r\n/g, "\n") };
});

const done = loaded.filter((l) => l.text.includes(MARK)).length;
if (done === loaded.length) {
  console.log("[patch-hand-delivery] deja applique, rien a faire.");
  process.exit(0);
}
if (done > 0) fail("etat incoherent : le marqueur est present dans certains fichiers seulement. Verifiez manuellement. Rien n'a ete ecrit.");

// ---- verification de TOUTES les ancres avant toute ecriture ----
const problems = [];
for (const l of loaded) {
  for (const e of l.edits) {
    const n = (l.text.match(e.re) || []).length;
    if (n !== 1) problems.push(`${l.file} : « ${e.label} » trouvee ${n} fois au lieu de 1`);
  }
}
if (problems.length) fail("au moins une ancre ne correspond pas (fichier modifie depuis, ou texte different de celui verifie). Rien n'a ete ecrit :\n  - " + problems.join("\n  - "));

// ---- application en memoire puis controles finaux ----
for (const l of loaded) {
  let t = l.text;
  for (const e of l.edits) t = t.replace(e.re, e.to);
  for (const [ok, what] of l.final(t)) if (!ok) fail(`controle final ${l.file} : ${what} absent apres patch. Rien n'a ete ecrit.`);
  if (!t.includes(MARK) && l.key !== "compte" && l.key !== "facture") fail(`controle final ${l.file} : marqueur absent. Rien n'a ete ecrit.`);
  l.out = t;
}
// le marqueur doit figurer dans chacun des 4 fichiers (sinon la reprise « deja applique » serait faussee)
for (const l of loaded) if (!l.out.includes(MARK)) fail(`controle final ${l.file} : marqueur absent. Rien n'a ete ecrit.`);

// ---- ecriture (tout ou rien) ----
for (const l of loaded) fs.writeFileSync(l.abs, l.crlf ? l.out.replace(/\n/g, "\r\n") : l.out, "utf8");

console.log("[patch-hand-delivery] 4 fichiers mis a jour :");
for (const l of loaded) console.log("[patch-hand-delivery]   - " + l.file);
console.log("[patch-hand-delivery] Aucun script SQL a executer (verifie : aucune contrainte sur orders.carrier / orders.tracking_number).");
