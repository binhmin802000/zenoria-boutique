// scripts/add-checkout-debug-response.mjs
//
// Modifie TEMPORAIREMENT pages/api/checkout.js pour que le message
// d'erreur complet (err.message) soit inclus directement dans la reponse
// JSON renvoyee au navigateur/PowerShell, au lieu de se contenter du
// message generique. Ceci permet de diagnostiquer sans dependre de
// l'interface des logs Vercel.
//
// A RETIRER une fois le diagnostic termine (voir
// remove-checkout-debug-response.mjs, fourni separement) : ne jamais
// laisser un detail d'erreur technique visible en production.
//
// Garanties : verifie le repere exact avant d'ecrire, n'ecrit rien si le
// repere manque ou si la modification est deja en place, conserve les
// fins de ligne du fichier, peut etre relance sans effet.
//
// Usage : node scripts/add-checkout-debug-response.mjs

import fs from "node:fs";
import path from "node:path";

const filePath = path.join("pages", "api", "checkout.js");

if (!fs.existsSync(filePath)) {
  console.error(`✗ Fichier introuvable : ${filePath}`);
  console.error("Lancez cette commande depuis le dossier « zenoria ».");
  process.exit(1);
}

const raw = fs.readFileSync(filePath, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";

if (raw.includes("_debug:")) {
  console.log("✓ Rien à modifier : la réponse de diagnostic est déjà en place.");
  process.exit(0);
}

const needle =
  '  } catch (err) {' + eol +
  '    console.error("[checkout]", err && err.message ? err.message : err);' + eol +
  '    return res.status(500).json({ ok: false, error: "erreur lors de la création du paiement" });' + eol +
  '  }';

if (!raw.includes(needle)) {
  console.error("✗ 1 repère à adapter — aucun fichier n'a été modifié.\n");
  console.error("  • bloc catch (avec console.error) attendu, introuvable tel quel dans pages/api/checkout.js");
  console.error("\nVérifiez le contenu actuel du fichier et collez-moi les lignes concernées.");
  process.exit(1);
}

const replacement =
  '  } catch (err) {' + eol +
  '    const msg = err && err.message ? err.message : String(err);' + eol +
  '    console.error("[checkout]", msg);' + eol +
  '    return res.status(500).json({ ok: false, error: "erreur lors de la création du paiement", _debug: msg });' + eol +
  '  }';

const updated = raw.replace(needle, replacement);
fs.writeFileSync(filePath, updated, "utf8");

console.log(`✓ ${filePath} : réponse de diagnostic (_debug) ajoutée.`);
console.log("\nTerminé. À RETIRER une fois le diagnostic fait (ne pas laisser en production).");
