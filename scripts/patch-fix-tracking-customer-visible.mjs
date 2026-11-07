#!/usr/bin/env node
// ============================================================
// patch-fix-tracking-customer-visible.mjs  -  ZENORIA_FIX_TRACKING_VISIBLE_V1
//
// Corrige un defaut constate sur la commande ZEN-2026-1107-0193 (et confirme sur 24 autres lignes en base,
// depuis le 18/10/2026) : le parcours de commande affiche dans l'espace cliente (Payee / Expediee / Livree)
// ne montrait jamais l'etape "Expediee" ni "Livree", alors que le badge de statut etait correct.
//
// Cause : pages/api/admin/orders/update-status.js insere une ligne dans order_status_history pour les
// actions "ship" et "deliver" SANS preciser customer_visible, qui reste alors a sa valeur par defaut (false).
// La frise de pages/compte.js (Timeline, TRACKING_STEPS) ne lit que les lignes customer_visible = true :
// les etapes "shipped" et "delivered" restaient donc toujours invisibles cote cliente.
//
// Ce lot ne corrige QUE le code (les nouvelles expeditions/livraisons a partir de maintenant).
// Le rattrapage des lignes deja en base se fait separement, par un script SQL (lot 2), a executer
// APRES la fusion de ce correctif en production.
//
// Utilisation (depuis la racine du projet) :
//   node scripts/patch-fix-tracking-customer-visible.mjs --dry-run   (controle les ancres, n'ecrit rien)
//   node scripts/patch-fix-tracking-customer-visible.mjs             (applique)
//
// Le script s'arrete sans rien ecrire si une ancre est absente, en double ou inattendue.
// ============================================================
import fs from "node:fs";
import path from "node:path";

const DRY = process.argv.includes("--dry-run");
const ROOT = process.cwd();
const MARK = "ZENORIA_FIX_TRACKING_VISIBLE_V1";

function stop(msg) {
  console.error("\nARRET : " + msg + "\nRien n'a ete ecrit.");
  process.exit(1);
}
const count = (s, sub) => s.split(sub).length - 1;

const rel = "pages/api/admin/orders/update-status.js";
const file = path.join(ROOT, ...rel.split("/"));
if (!fs.existsSync(file)) stop(rel + " introuvable (lance le script depuis la racine du projet).");
const raw = fs.readFileSync(file, "utf8");
const crlf = (raw.match(/\r\n/g) || []).length;
const lf = (raw.match(/\n/g) || []).length - crlf;
if (crlf > 0 && lf > 0) stop(rel + " melange des fins de ligne CRLF et LF (" + crlf + " CRLF, " + lf + " LF) : je ne touche pas a un fichier dans cet etat.");
const eol = crlf > 0 ? "\r\n" : "\n";
const text = raw.replace(/\r\n/g, "\n");

if (text.includes(MARK)) stop("le marqueur " + MARK + " est deja present dans " + rel + " : lot deja applique.");

const EDITS = [
  {
    label: "insertion de l'historique pour l'expedition (action ship)",
    from:
      '      const { error: historyErr } = await supabaseAdmin.from("order_status_history").insert({\n' +
      "        order_id: id,\n" +
      '        status: "shipped",\n' +
      '        note: "Expédiée via " + carrier + ", suivi : " + trimmedTracking + ".",\n' +
      "        actor_email: admin.email || null, // ZENORIA_ORDER_ACTOR_5G_V1 : auteur de l'expédition (compte administrateur connecté)\n" +
      "      });\n",
    to:
      '      const { error: historyErr } = await supabaseAdmin.from("order_status_history").insert({\n' +
      "        order_id: id,\n" +
      '        status: "shipped",\n' +
      '        note: "Expédiée via " + carrier + ", suivi : " + trimmedTracking + ".",\n' +
      "        actor_email: admin.email || null, // ZENORIA_ORDER_ACTOR_5G_V1 : auteur de l'expédition (compte administrateur connecté)\n" +
      "        customer_visible: true, // " + MARK + " : sans ce champ, l'etape \"Expediee\" ne s'affichait jamais dans l'espace cliente\n" +
      "      });\n",
  },
  {
    label: "insertion de l'historique pour la livraison (action deliver)",
    from:
      '    const { error: historyErr } = await supabaseAdmin.from("order_status_history").insert({\n' +
      "      order_id: id,\n" +
      '      status: "delivered",\n' +
      '      note: "Marquée comme livrée manuellement depuis l\'administration.",\n' +
      "      actor_email: admin.email || null, // ZENORIA_ORDER_ACTOR_5G_V1 : auteur de la livraison (compte administrateur connecté)\n" +
      "    });\n",
    to:
      '    const { error: historyErr } = await supabaseAdmin.from("order_status_history").insert({\n' +
      "      order_id: id,\n" +
      '      status: "delivered",\n' +
      '      note: "Marquée comme livrée manuellement depuis l\'administration.",\n' +
      "      actor_email: admin.email || null, // ZENORIA_ORDER_ACTOR_5G_V1 : auteur de la livraison (compte administrateur connecté)\n" +
      "      customer_visible: true, // " + MARK + " : sans ce champ, l'etape \"Livree\" ne s'affichait jamais dans l'espace cliente\n" +
      "    });\n",
  },
];

for (const e of EDITS) {
  const n = count(text, e.from);
  if (n !== 1) stop(rel + " : ancre « " + e.label + " » trouvee " + n + " fois (attendu : 1). Le fichier a change depuis l'audit.");
}
// Les deux ancres ne doivent pas se chevaucher : l'une avant l'autre, dans l'ordre attendu (ship avant deliver)
const posShip = text.indexOf(EDITS[0].from);
const posDeliver = text.indexOf(EDITS[1].from);
if (!(posShip < posDeliver)) stop("l'ordre des deux insertions (ship puis deliver) est inattendu : a verifier avant de modifier.");

let next = text;
for (const e of EDITS) next = next.replace(e.from, () => e.to);

if (count(next, "customer_visible: true") !== 2) stop("controle final : « customer_visible: true » devrait apparaitre 2 fois, il apparait " + count(next, "customer_visible: true") + " fois.");
if (count(next, MARK) !== 2) stop("controle final : le marqueur devrait apparaitre 2 fois, il apparait " + count(next, MARK) + " fois.");

console.log("Correctif - customer_visible manquant sur l'historique d'expedition et de livraison");
console.log(" - fin de ligne detectee : " + (eol === "\r\n" ? "CRLF" : "LF"));
console.log(" - " + rel + " : " + text.split("\n").length + " -> " + next.split("\n").length + " lignes (+2 : customer_visible: true sur ship et deliver)");

if (DRY) {
  console.log("\nDRY-RUN OK : les deux ancres sont uniques et conformes. Rien n'a ete ecrit.");
  process.exit(0);
}
fs.writeFileSync(file, eol === "\r\n" ? next.replace(/\n/g, "\r\n") : next, "utf8");
console.log("\nOK : fichier ecrit. Lance maintenant : npm run build");
