// scripts/add-checkout-logging.mjs
//
// Ajoute un console.error(err) dans le bloc "catch" de
// pages/api/checkout.js, pour que le detail de l'erreur apparaisse dans
// les Runtime Logs de Vercel (indispensable pour diagnostiquer l'echec
// actuel : "erreur lors de la creation du paiement", sans aucun detail).
//
// Garanties : verifie le repere exact avant d'ecrire, n'ecrit rien si le
// repere manque ou si le logging est deja en place, conserve les fins de
// ligne du fichier, peut etre relance sans effet.
//
// Usage : node scripts/add-checkout-logging.mjs

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

if (raw.includes("console.error(\"[checkout]\"")) {
  console.log("✓ Rien à modifier : le logging est déjà en place.");
  process.exit(0);
}

const needle =
  '  } catch (err) {' + eol +
  '    return res.status(500).json({ ok: false, error: "erreur lors de la création du paiement" });' + eol +
  '  }';

if (!raw.includes(needle)) {
  console.error("✗ 1 repère à adapter — aucun fichier n'a été modifié.\n");
  console.error("  • bloc catch attendu, introuvable tel quel dans pages/api/checkout.js");
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

console.log(`✓ ${filePath} : console.error ajouté dans le bloc catch.`);
console.log("\nTerminé. Ce log est temporaire : on le retirera une fois le diagnostic terminé.");
