// scripts/add-footer-contact-email.mjs
//
// Ajoute un lien de contact e-mail dans la colonne "Informations" du
// footer (pages/index.js), avec objet et corps pre-remplis (texte neutre,
// valide comme point de depart pour tout motif de contact) :
//   Objet : "Question depuis le site Zenoria"
//   Corps : "Bonjour,"
//
// L'icone Mail (lucide-react) est ajoutee a l'import existant. Aucune
// icone n'est dupliquee si deja presente.
//
// WhatsApp et Signal sont volontairement exclus de ce script : ils
// seront ajoutes separement, une fois le numero dedie choisi et les
// profils configures (logo en photo de profil), comme convenu.
//
// Garanties : verifie le repere exact avant d'ecrire, n'ecrit rien si le
// repere manque ou si c'est deja en place, conserve les fins de ligne du
// fichier, peut etre relance sans effet.
//
// Usage : node scripts/add-footer-contact-email.mjs

import fs from "node:fs";
import path from "node:path";

const filePath = path.join("pages", "index.js");

if (!fs.existsSync(filePath)) {
  console.error(`✗ Fichier introuvable : ${filePath}`);
  console.error("Lancez cette commande depuis le dossier « zenoria ».");
  process.exit(1);
}

const raw = fs.readFileSync(filePath, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";

if (raw.includes("footer-contact-email")) {
  console.log("✓ Rien à modifier : le lien de contact e-mail est déjà en place.");
  process.exit(0);
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

const anchors = {};

anchors.lucideImport =
  "import {" + eol +
  "  ShoppingBag, Search, User, Heart, Menu, X, Sparkles, ArrowRight," + eol +
  "  Gem, Instagram, LogOut, Minus, Plus, Trash2, Tag, Truck, Settings" + eol +
  '} from "lucide-react";';

anchors.infoColumnBlock =
  '          <div>' + eol +
  '            <div className="text-white mb-3">Informations</div>' + eol +
  '            <div className="text-sm space-y-2">' + eol +
  "              <p>Livraison et retours</p>" + eol +
  "              <p>FAQ</p>" + eol +
  "              <p>Mentions légales</p>" + eol +
  '              <p><a href="/confidentialite" className="hover:text-white underline-offset-2 hover:underline">Politique de confidentialité</a></p>' + eol +
  "            </div>" + eol +
  "          </div>";

const missing = [];
for (const [key, needle] of Object.entries(anchors)) {
  const count = countOccurrences(raw, needle);
  if (count !== 1) missing.push({ key, count });
}

if (missing.length > 0) {
  console.error(`✗ ${missing.length} repère(s) à adapter — aucun fichier n'a été modifié.\n`);
  for (const m of missing) {
    console.error(`  • repère « ${m.key} » (${m.count} correspondance(s) trouvée(s), 1 attendue)`);
  }
  console.error("\nVérifiez le contenu actuel de pages/index.js et collez-moi les lignes concernées.");
  process.exit(1);
}

let out = raw;

// 1) Ajoute l'icône Mail à l'import lucide-react existant, si absente
if (!out.includes(", Mail,") && !out.includes(", Mail }") && !out.includes("Mail,")) {
  out = out.replace(
    anchors.lucideImport,
    "import {" + eol +
      "  ShoppingBag, Search, User, Heart, Menu, X, Sparkles, ArrowRight," + eol +
      "  Gem, Instagram, LogOut, Minus, Plus, Trash2, Tag, Truck, Settings, Mail" + eol +
      '} from "lucide-react";'
  );
}

// 2) Ajoute le lien de contact e-mail sous les liens existants de la colonne Informations
const newInfoColumnBlock =
  '          <div>' + eol +
  '            <div className="text-white mb-3">Informations</div>' + eol +
  '            <div className="text-sm space-y-2">' + eol +
  "              <p>Livraison et retours</p>" + eol +
  "              <p>FAQ</p>" + eol +
  "              <p>Mentions légales</p>" + eol +
  '              <p><a href="/confidentialite" className="hover:text-white underline-offset-2 hover:underline">Politique de confidentialité</a></p>' + eol +
  "            </div>" + eol +
  '            <div className="mt-4 pt-4 border-t border-white/10 text-sm">' + eol +
  "              <a" + eol +
  '                href="mailto:bagues.mandala@proton.me?subject=Question%20depuis%20le%20site%20Zenoria&body=Bonjour%2C%0D%0A%0D%0A"' + eol +
  '                data-testid="footer-contact-email"' + eol +
  '                className="flex items-center gap-2 hover:text-white underline-offset-2 hover:underline"' + eol +
  "              >" + eol +
  '                <Mail size={15} className="shrink-0" /> bagues.mandala@proton.me' + eol +
  "              </a>" + eol +
  "            </div>" + eol +
  "          </div>";

out = out.replace(anchors.infoColumnBlock, newInfoColumnBlock);

fs.writeFileSync(filePath, out, "utf8");

console.log(`✓ ${filePath} : lien de contact e-mail ajouté dans le footer (colonne Informations)`);
console.log("  • icône Mail ajoutée à l'import lucide-react (si pas déjà présente)");
console.log("  • objet et corps pré-remplis : « Question depuis le site Zenoria » / « Bonjour, »");
console.log("\nTerminé.");
