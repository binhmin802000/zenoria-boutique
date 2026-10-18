// scripts/patch-index-load-contact-setting.mjs
//
// Ajoute la lecture du reglage "contact" (lib/contactSettings.js) dans
// le chargement groupe existant de pages/index.js, sur le meme modele
// que shippingCfg/fxSetting/siteTexts :
//   1. Nouvel etat contactSettings (useState(DEFAULT_CONTACT)).
//   2. CONTACT_KEY ajoute a la liste des cles lues par la requete
//      groupee .in("key", [...]).
//   3. setContactSettings(parseContactSetting(...)) ajoute juste apres
//      setShippingCfg, en suivant exactement le meme filtrage
//      (settingRows.find(...)).
//
// Garanties : verifie TOUS les reperes avant d'ecrire quoi que ce soit ;
// n'ecrit rien si un seul manque ; liste tous les reperes manquants ;
// conserve les fins de ligne du fichier ; peut etre relance sans effet.
//
// Usage : node scripts/patch-index-load-contact-setting.mjs

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

if (raw.includes("setContactSettings(")) {
  console.log("✓ Rien à modifier : le chargement du réglage contact est déjà en place.");
  process.exit(0);
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

const anchors = {};

anchors.contactSettingsImport = 'import { supabase, getMediaUrl } from "@/lib/supabase";';

anchors.shippingCfgState =
  "  const [shippingCfg, setShippingCfg] = useState(DEFAULT_SHIPPING); // livraison offerte : montant et interrupteur (onglet « Contenu du site » de /admin), par défaut tant qu'ils ne sont pas lus";

anchors.inKeyQuery =
  'optionalQuery(supabase.from(SITE_SETTINGS_TABLE).select("key, value").in("key", [SEASON_FX_KEY, SHIPPING_KEY, SITE_TEXTS_KEY])),';

anchors.setShippingCfgCall =
  "      // Livraison offerte : si la ligne n'existe pas encore (script SQL non exécuté), le site garde la valeur par défaut" + eol +
  "      setShippingCfg(parseShippingSetting(shipRow ? shipRow.value : null));";

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

// 1) Import des fonctions de contactSettings, à côté de l'import supabase
out = out.replace(
  anchors.contactSettingsImport,
  anchors.contactSettingsImport + eol +
    'import { CONTACT_KEY, DEFAULT_CONTACT, parseContactSetting, buildMailtoLink, buildWhatsAppLink, buildSignalLink } from "@/lib/contactSettings";'
);

// 2) Nouvel état, juste après shippingCfg
out = out.replace(
  anchors.shippingCfgState,
  anchors.shippingCfgState + eol +
    "  const [contactSettings, setContactSettings] = useState(DEFAULT_CONTACT); // canaux de contact (e-mail, WhatsApp, Signal), onglet « Contenu du site » de /admin"
);

// 3) Ajoute CONTACT_KEY à la liste des clés lues par la requête groupée
out = out.replace(
  anchors.inKeyQuery,
  'optionalQuery(supabase.from(SITE_SETTINGS_TABLE).select("key, value").in("key", [SEASON_FX_KEY, SHIPPING_KEY, SITE_TEXTS_KEY, CONTACT_KEY])),'
);

// 4) Lit et applique le réglage contact, juste après shippingCfg, en
//    suivant exactement le même filtrage settingRows.find(...)
out = out.replace(
  anchors.setShippingCfgCall,
  anchors.setShippingCfgCall + eol +
    "      // Canaux de contact : si la ligne n'existe pas encore, le site garde la valeur par défaut (e-mail seul)" + eol +
    '      const contactRow = settingRows.find((r) => r.key === CONTACT_KEY) || null;' + eol +
    "      setContactSettings(parseContactSetting(contactRow ? contactRow.value : null));"
);

fs.writeFileSync(filePath, out, "utf8");

console.log(`✓ ${filePath} : chargement du réglage « contact » ajouté`);
console.log("  • état contactSettings ajouté (valeur par défaut : e-mail seul)");
console.log("  • CONTACT_KEY inclus dans la requête groupée existante (aucun appel réseau supplémentaire)");
console.log("  • lecture appliquée juste après shippingCfg, même filtrage que les autres réglages");
console.log("\nTerminé.");
