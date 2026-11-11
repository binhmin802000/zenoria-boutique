#!/usr/bin/env node
// ============================================================
// patch-cart-clear-after-stripe.mjs
// ZENORIA_CART_CLEAR_STRIPE_V1
//
// Corrige le panier qui reste rempli apres un paiement par CARTE reussi (pages/index.js).
//
// Cause : au retour de Stripe (?paiement=succes), la page vide le panier EN MEMOIRE, tout de suite au chargement.
// Mais la lecture du panier enregistre dans le navigateur (localStorage) se fait un peu plus tard, une fois le
// catalogue charge depuis la base : elle REMET le panier paye. Rien n'efface le panier enregistre, et son
// enregistrement n'est actif qu'apres cette lecture. Le virement n'est pas concerne (pas de rechargement de page).
//
// Correctif : au retour de Stripe, on efface aussi le panier ENREGISTRE (une ligne), avant que la lecture ne se fasse.
// Rien d'autre ne change : une visite normale conserve toujours le panier.
//
// Usage : node scripts/patch-cart-clear-after-stripe.mjs      Idempotent. Une ancre fausse : arret SANS RIEN ECRIRE.
// ============================================================
import fs from "node:fs";
import path from "node:path";

const MARK = "ZENORIA_CART_CLEAR_STRIPE_V1";
const FILE = path.join(process.cwd(), "pages", "index.js");
const fail = (m) => { console.error(`[patch-cart-clear-after-stripe] ${m}`); process.exit(1); };

if (!fs.existsSync(FILE)) fail(`fichier introuvable : ${FILE} (lancez le script depuis la racine du projet)`);
const original = fs.readFileSync(FILE, "utf8");
if (original.includes(MARK)) { console.log("[patch-cart-clear-after-stripe] deja applique, rien a faire."); process.exit(0); }
const crlf = original.includes("\r\n");
const text = original.replace(/\r\n/g, "\n");

const RE = /^([ \t]*)if \(params\.get\("paiement"\) === "succes"\) \{[ \t]*\n/gm;
const nBlock = (text.match(RE) || []).length;
const nKey = (text.match(/const CART_STORAGE_KEY = /g) || []).length;
const problems = [];
if (nBlock !== 1) problems.push(`bloc « if (params.get("paiement") === "succes") { » trouve ${nBlock} fois au lieu de 1`);
if (nKey !== 1) problems.push(`constante CART_STORAGE_KEY trouvee ${nKey} fois au lieu de 1`);
if (problems.length) fail("au moins une ancre ne correspond pas (fichier modifie depuis, ou texte different de celui verifie). Rien n'a ete ecrit :\n  - " + problems.join("\n  - "));

const out = text.replace(RE, (m, indent) =>
  m +
  indent + "  // " + MARK + " : on efface aussi le panier ENREGISTRE. Sinon la lecture du panier (faite apres le chargement du catalogue)\n" +
  indent + "  // remettrait le panier qui vient d'etre paye. Une visite normale n'est pas concernee (ce bloc ne s'execute qu'au retour de Stripe).\n" +
  indent + "  try { window.localStorage.removeItem(CART_STORAGE_KEY); } catch (e) { /* stockage indisponible */ }\n");

if (!out.includes(MARK) || !out.includes("window.localStorage.removeItem(CART_STORAGE_KEY)")) fail("controle final : ligne absente apres patch. Rien n'a ete ecrit.");
if ((out.match(/window\.localStorage\.removeItem\(CART_STORAGE_KEY\)/g) || []).length !== 1) fail("controle final : removeItem doit apparaitre exactement 1 fois. Rien n'a ete ecrit.");

fs.writeFileSync(FILE, crlf ? out.replace(/\n/g, "\r\n") : out, "utf8");
console.log("[patch-cart-clear-after-stripe] pages/index.js mis a jour : le panier enregistre est efface au retour d'un paiement par carte.");
