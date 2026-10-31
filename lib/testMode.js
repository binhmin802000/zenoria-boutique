// ZENORIA_TEST_MODE_V1
// ============================================================
// lib/testMode.js
//
// REGLE UNIQUE : une commande est une commande de TEST tant que la cle secrete Stripe n'est pas une cle du mode REEL (sk_live_).
// Utilisee par TOUTES les routes qui creent une commande :
//   - pages/api/checkout.js           (paiement par carte)
//   - pages/api/checkout-transfer.js  (paiement par virement)
// Avant ce fichier, le virement decidait d'apres l'environnement de deploiement : une commande passee sur le site de production
// etait donc enregistree « reelle » alors que Stripe etait encore en mode test (commande 121 du 31/10/2026).
// Effet voulu : UN SEUL interrupteur. Quand la cle live est mise en production (etape d'activation), carte ET virement passent ensemble
// en commandes reelles ; tant que la cle est une cle de test, aucune commande reelle ne peut etre creee, ni par carte, ni par virement.
// Cle absente ou illisible : commande de TEST (le cas sur est de ne jamais creer une vraie commande par erreur).
// ============================================================
export function isTestOrderMode(secretKey = process.env.STRIPE_SECRET_KEY) {
  return !String(secretKey || "").startsWith("sk_live_");
}
