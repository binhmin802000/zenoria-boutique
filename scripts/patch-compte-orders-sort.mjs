#!/usr/bin/env node
// ============================================================
// patch-compte-orders-sort.mjs
// ZENORIA_COMPTE_ORDERS_SORT_V1
//
// Corrige l'ORDRE d'affichage des commandes dans Mon compte (pages/compte.js).
//
// Cause : la liste finale etait construite en 3 blocs concatenes
//     setOrders([...transferOrders, ...cardFinished, ...cardUnfinished])
// Chaque bloc etait trie par date (la requete trie par created_at decroissant), mais PAS la liste finale :
// tous les virements passaient avant toutes les commandes carte. Avec les deux modes de paiement actifs,
// une commande carte recente apparaissait apres des virements anciens (commande ZEN-2026-1111-0197).
// Consequence secondaire : « Derniere commande » de l'Accueil (finishedOrders[0]) etait faux.
//
// Correctif : UN SEUL tri de la liste finale, par date de creation decroissante ; a date egale ou invalide,
// par id decroissant. Les trois filtres (regle de visibilite de ZENORIA_STEP3C2_V1) ne changent pas.
//
// Usage : node scripts/patch-compte-orders-sort.mjs      Idempotent. Une ancre fausse : arret SANS RIEN ECRIRE.
// ============================================================
import fs from "node:fs";
import path from "node:path";

const MARK = "ZENORIA_COMPTE_ORDERS_SORT_V1";
const FILE = path.join(process.cwd(), "pages", "compte.js");
const fail = (m) => { console.error(`[patch-compte-orders-sort] ${m}`); process.exit(1); };

if (!fs.existsSync(FILE)) fail(`fichier introuvable : ${FILE} (lancez le script depuis la racine du projet)`);
const original = fs.readFileSync(FILE, "utf8");
if (original.includes(MARK)) { console.log("[patch-compte-orders-sort] deja applique, rien a faire."); process.exit(0); }
const crlf = original.includes("\r\n");
const text = original.replace(/\r\n/g, "\n");

const FROM = "      setOrders([...transferOrders, ...cardFinished, ...cardUnfinished]);\n";
const TO =
  "      // " + MARK + " : un seul tri sur la liste finale (les 3 blocs ci-dessus ne sont tries que chacun de leur cote).\n" +
  "      // Plus recente d'abord ; a date egale ou invalide, id decroissant. Les regles de visibilite ci-dessus sont inchangees.\n" +
  "      const byNewest = (a, b) => {\n" +
  "        const ta = Date.parse(a.created_at);\n" +
  "        const tb = Date.parse(b.created_at);\n" +
  "        const da = Number.isNaN(ta) ? -Infinity : ta;\n" +
  "        const db = Number.isNaN(tb) ? -Infinity : tb;\n" +
  "        if (da !== db) return db > da ? 1 : -1;\n" +
  "        return Number(b.id) - Number(a.id);\n" +
  "      };\n" +
  "      setOrders([...transferOrders, ...cardFinished, ...cardUnfinished].sort(byNewest));\n";

const count = text.split(FROM).length - 1;
if (count !== 1) fail(`ancre « setOrders([...transferOrders, ...cardFinished, ...cardUnfinished]) » trouvee ${count} fois au lieu de 1. Rien n'a ete ecrit.`);

const out = text.replace(FROM, () => TO);
if (!out.includes(MARK) || !out.includes(".sort(byNewest)")) fail("controle final : tri absent apres patch. Rien n'a ete ecrit.");
if (out.includes("setOrders([...transferOrders, ...cardFinished, ...cardUnfinished]);")) fail("controle final : ancienne ligne toujours presente. Rien n'a ete ecrit.");

fs.writeFileSync(FILE, crlf ? out.replace(/\n/g, "\r\n") : out, "utf8");
console.log("[patch-compte-orders-sort] pages/compte.js mis a jour : commandes triees de la plus recente a la plus ancienne.");
