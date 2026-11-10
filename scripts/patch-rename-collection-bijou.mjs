#!/usr/bin/env node
// ============================================================
// patch-rename-collection-bijou.mjs
// ZENORIA_RENAME_COLLECTION_BIJOU_V1
//
// Renomme, dans l'onglet Produits > Bijoux de l'admin (pages/admin.js),
// le libelle "Collection(s)" en "Bijou(x)" :
//   - titre "Collections" -> "Bijoux"
//   - "N collection(s) au catalogue" -> "N bijou(x) au catalogue"
//   - bouton "Nouvelle collection" -> "Nouveau bijou"
//   - en-tete de colonne "Collection" -> "Bijou"
//   - titre de la fenetre "Modifier la collection" / "Nouvelle collection"
//     -> "Modifier le bijou" / "Nouveau bijou"
//   - messages de confirmation "Collection mise a jour."/"creee."/"supprimee."
//     -> "Bijou mis a jour."/"cree."/"supprime."
//
// NE TOUCHE JAMAIS a "collections" utilise comme IDENTIFIANT TECHNIQUE
// (goTo("produits", "collections"), tab === "collections") : ces deux
// occurrences ne sont volontairement pas dans la liste de remplacements
// ci-dessous.
//
// Usage : node scripts/patch-rename-collection-bijou.mjs
// Idempotent : si deja applique, ne fait rien. Si UNE SEULE ancre ne
// correspond pas EXACTEMENT, le script s'arrete SANS RIEN ECRIRE (tout ou rien).
// ============================================================
import fs from "node:fs";
import path from "node:path";

const MARK = "ZENORIA_RENAME_COLLECTION_BIJOU_V1";
const FILE = path.join(process.cwd(), "pages", "admin.js");

function fail(message) {
  console.error(`[patch-rename-collection-bijou] ${message}`);
  process.exit(1);
}

if (!fs.existsSync(FILE)) {
  fail(`fichier introuvable : ${FILE} (lancez le script depuis la racine du projet)`);
}

const original = fs.readFileSync(FILE, "utf8");
if (original.includes(MARK)) {
  console.log("[patch-rename-collection-bijou] déjà appliqué, rien à faire.");
  process.exit(0);
}

const usesCRLF = original.includes("\r\n");
const content = original.replace(/\r\n/g, "\n");

// Chaque entrée : { label, from, to }. "from" doit apparaître EXACTEMENT 1 fois.
const EDITS = [
  {
    label: "message : Collection mise à jour / créée",
    from: '    setToast(productForm.id ? "Collection mise à jour." : "Collection créée.");\n',
    to: '    setToast(productForm.id ? "Bijou mis à jour." : "Bijou créé."); // ' + MARK + '\n',
  },
  {
    label: "message : Collection supprimée",
    from: '      setToast("Collection supprimée.");\n',
    to: '      setToast("Bijou supprimé."); // ' + MARK + '\n',
  },
  {
    label: "titre h1 : Collections",
    from: '                <h1 className="font-serif text-2xl">Collections</h1>\n',
    to: '                <h1 className="font-serif text-2xl">Bijoux</h1> {/* ' + MARK + ' */}\n',
  },
  {
    label: "sous-titre : N collection(s) au catalogue",
    from: '                <p className="text-sm text-[#8b737e]">{products.length} collection{products.length > 1 ? "s" : ""} au catalogue</p>\n',
    to: '                <p className="text-sm text-[#8b737e]">{products.length} bijou{products.length > 1 ? "x" : ""} au catalogue</p> {/* ' + MARK + ' */}\n',
  },
  {
    label: "bouton : Nouvelle collection (liste)",
    from: '                <Plus size={16} /> Nouvelle collection\n',
    to: '                <Plus size={16} /> Nouveau bijou {/* ' + MARK + ' */}\n',
  },
  {
    label: "en-tête de colonne : Collection",
    from: '                    <th className="px-4 py-3 font-medium">Collection</th>\n',
    to: '                    <th className="px-4 py-3 font-medium">Bijou</th> {/* ' + MARK + ' */}\n',
  },
  {
    label: "titre de la fenêtre : Modifier la collection / Nouvelle collection",
    from: '                <h2 className="font-serif text-2xl">{productForm.id ? "Modifier la collection" : "Nouvelle collection"}</h2>\n',
    to: '                <h2 className="font-serif text-2xl">{productForm.id ? "Modifier le bijou" : "Nouveau bijou"}</h2> {/* ' + MARK + ' */}\n',
  },
];

// ------------------------------------------------------------
// Vérification : chaque ancre doit apparaître EXACTEMENT 1 fois.
// Garde-fou supplémentaire : on vérifie aussi qu'on NE CASSE PAS les
// deux occurrences techniques de "collections" (identifiant d'onglet),
// qui ne font partie d'aucune ancre ci-dessus et doivent rester intactes.
// ------------------------------------------------------------
const problems = [];
for (const e of EDITS) {
  const count = content.split(e.from).length - 1;
  if (count !== 1) {
    problems.push(`« ${e.label} » trouvée ${count} fois au lieu de 1`);
  }
}
const technicalAnchor1 = 'goTo("produits", "collections");';
const technicalAnchor2 = '{tab === "collections" && (';
if (content.split(technicalAnchor1).length - 1 !== 1) {
  problems.push(`ancre technique « goTo("produits", "collections") » introuvable (identifiant d'onglet) : vérification de sécurité`);
}
if (content.split(technicalAnchor2).length - 1 !== 1) {
  problems.push(`ancre technique « tab === "collections" » introuvable (identifiant d'onglet) : vérification de sécurité`);
}

if (problems.length > 0) {
  fail(
    "au moins une ancre ne correspond pas. Fichier modifié depuis, ou texte différent de ce qui a été vérifié. " +
    "Rien n'a été écrit. Détail :\n  - " + problems.join("\n  - ")
  );
}

// ------------------------------------------------------------
// Application (tout ou rien, déjà validé ci-dessus)
// ------------------------------------------------------------
let updated = content;
for (const e of EDITS) {
  updated = updated.replace(e.from, () => e.to);
}

// Contrôles finaux : les identifiants techniques doivent être encore présents et inchangés,
// et aucun des 2 ne doit avoir été touché par erreur.
if (updated.split(technicalAnchor1).length - 1 !== 1) {
  fail("contrôle final : l'identifiant technique goTo(\"produits\", \"collections\") a été altéré. Rien n'est conservé par précaution.");
}
if (updated.split(technicalAnchor2).length - 1 !== 1) {
  fail("contrôle final : l'identifiant technique tab === \"collections\" a été altéré. Rien n'est conservé par précaution.");
}
if ((updated.match(new RegExp(MARK, "g")) || []).length !== 7) {
  fail("contrôle final : le marqueur devrait apparaître exactement 7 fois après patch.");
}

fs.writeFileSync(FILE, usesCRLF ? updated.replace(/\n/g, "\r\n") : updated, "utf8");

console.log("[patch-rename-collection-bijou] pages/admin.js mis à jour : 7 libellés remplacés (Collection(s) -> Bijou(x)).");
console.log("[patch-rename-collection-bijou] Les identifiants techniques d'onglet (\"collections\") n'ont pas été touchés.");
