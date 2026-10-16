// scripts/remove-checkout-debug-response.mjs
//
// Retire la reponse de diagnostic temporaire ajoutee par
// add-checkout-debug-response.mjs, pour revenir au message d'erreur
// generique (sans detail technique) avant toute mise en production reelle.
//
// Garanties : verifie le repere exact avant d'ecrire, n'ecrit rien si le
// repere manque ou si c'est deja retire, conserve les fins de ligne du
// fichier, peut etre relance sans effet.
//
// Usage : node scripts/remove-checkout-debug-response.mjs

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

if (!raw.includes("_debug:")) {
  console.log("✓ Rien à modifier : la réponse de diagnostic n'est déjà plus présente.");
  process.exit(0);
}

const needle =
  '  } catch (err) {' + eol +
  '    const msg = err && err.message ? err.message : String(err);' + eol +
  '    console.error("[checkout]", msg);' + eol +
  '    return res.status(500).json({ ok: false, error: "erreur lors de la création du paiement", _debug: msg });' + eol +
  '  }';

if (!raw.includes(needle)) {
  console.error("✗ 1 repère à adapter — aucun fichier n'a été modifié.\n");
  console.error("  • bloc catch (avec _debug) attendu, introuvable tel quel dans pages/api/checkout.js");
  console.error("\nVérifiez le contenu actuel du fichier et collez-moi les lignes concernées.");
  process.exit(1);
}

const replacement =
  '  } catch (err) {' + eol +
  '    console.error("[checkout]", err && err.message ? err.message : err);' + eol +
  '    return res.status(500).json({ ok: false, error: "erreur lors de la création du paiement" });' + eol +
  '  }';

const updated = raw.replace(needle, replacement);
fs.writeFileSync(filePath, updated, "utf8");

console.log(`✓ ${filePath} : réponse de diagnostic retirée, message générique rétabli.`);
console.log("\nTerminé.");
