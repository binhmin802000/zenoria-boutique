#!/usr/bin/env node
// ============================================================
// patch-webhook-is-test-coherent.mjs
// ZENORIA_TEST_MODE_WEBHOOK_V1
//
// Aligne pages/api/webhooks/stripe.js sur l'UNIQUE regle "is_test" deja
// utilisee par pages/api/checkout.js et pages/api/checkout-transfer.js
// (lib/testMode.js, ZENORIA_TEST_MODE_V1, commit efc74e7).
//
// AVANT : is_test: event.livemode === false
//   -> se fie au champ renvoye par l'evenement Stripe lui-meme.
// APRES : is_test: isTestOrderMode()
//   -> se fie exclusivement au prefixe de la cle secrete Stripe cote
//      serveur (sk_live_ ou non), comme pour la carte et le virement.
//
// Pourquoi : avec une cle restreinte (rk_live_ au lieu de sk_live_),
// isTestOrderMode() classerait une commande "test" alors que Stripe aurait
// traite un vrai paiement (event.livemode === true) : la commande creee
// par checkout.js (is_test=true) serait alors mise a jour par le webhook
// avec is_test=false. Deux sources de verite differentes, meme risque que
// l'incident de la commande 121 (31/10/2026). Ce patch n'en garde qu'une.
//
// Usage : node scripts/patch-webhook-is-test-coherent.mjs
// Idempotent : si deja applique, ne fait rien. Si l'ancre ne correspond
// pas EXACTEMENT, le script s'arrete SANS RIEN ECRIRE.
// ============================================================
import fs from "node:fs";
import path from "node:path";

const MARK = "ZENORIA_TEST_MODE_WEBHOOK_V1";
const FILE = path.join(process.cwd(), "pages", "api", "webhooks", "stripe.js");

function fail(message) {
  console.error(`[patch-webhook-is-test-coherent] ${message}`);
  process.exit(1);
}

if (!fs.existsSync(FILE)) {
  fail(`fichier introuvable : ${FILE} (lancez le script depuis la racine du projet)`);
}

const original = fs.readFileSync(FILE, "utf8");
if (original.includes(MARK)) {
  console.log("[patch-webhook-is-test-coherent] déjà appliqué, rien à faire.");
  process.exit(0);
}

const usesCRLF = original.includes("\r\n");
const content = original.replace(/\r\n/g, "\n");

// ------------------------------------------------------------
// 1) Import de isTestOrderMode, juste après l'import de supabaseAdmin
// ------------------------------------------------------------
const importAnchor = 'import { supabaseAdmin } from "@/lib/supabaseAdmin";\n';
const importCount = content.split(importAnchor).length - 1;
if (importCount !== 1) {
  fail(`ancre d'import (supabaseAdmin) trouvée ${importCount} fois au lieu de 1. Fichier modifié depuis ? Rien n'a été écrit.`);
}
const importReplacement =
  importAnchor +
  'import { isTestOrderMode } from "@/lib/testMode"; // ' + MARK + ' : même règle unique que checkout.js et checkout-transfer.js\n';

// ------------------------------------------------------------
// 2) Remplacement de la ligne is_test
// ------------------------------------------------------------
const lineAnchor = '          is_test: event.livemode === false,\n';
const lineCount = content.split(lineAnchor).length - 1;
if (lineCount !== 1) {
  fail(`ancre « is_test: event.livemode === false » trouvée ${lineCount} fois au lieu de 1. Fichier modifié depuis ? Rien n'a été écrit.`);
}
const lineReplacement =
  '          is_test: isTestOrderMode(), // ' + MARK + ' : règle unique avec checkout.js/checkout-transfer.js, plutôt que event.livemode\n';

// ------------------------------------------------------------
// Application
// ------------------------------------------------------------
let updated = content.replace(importAnchor, () => importReplacement);
updated = updated.replace(lineAnchor, () => lineReplacement);

if (updated.includes('event.livemode === false')) {
  fail("contrôle final : « event.livemode === false » est toujours présent après patch. Rien n'a été conservé par erreur ? Vérification manuelle nécessaire.");
}
if ((updated.match(/isTestOrderMode\(\)/g) || []).length !== 1) {
  fail("contrôle final : isTestOrderMode() devrait apparaître exactement 1 fois après patch.");
}

fs.writeFileSync(FILE, usesCRLF ? updated.replace(/\n/g, "\r\n") : updated, "utf8");

console.log("[patch-webhook-is-test-coherent] pages/api/webhooks/stripe.js mis à jour :");
console.log("[patch-webhook-is-test-coherent]   - import de isTestOrderMode ajouté");
console.log("[patch-webhook-is-test-coherent]   - is_test utilise désormais isTestOrderMode(), comme checkout.js et checkout-transfer.js");
