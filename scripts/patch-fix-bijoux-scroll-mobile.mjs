// ============================================================
// PATCH — LISTE « BIJOUX » DE L'ADMINISTRATION : DEFILEMENT HORIZONTAL SUR MOBILE — ZENORIA_ADMIN_BIJOUX_SCROLL_V1
//
// Probleme : le tableau des bijoux est plus large que l'ecran du telephone, et son cadre porte « overflow-hidden » :
// tout ce qui depasse est coupe (colonnes « Statut » et « Actions »), sans defilement possible, donc le crayon
// de modification est inaccessible.
// Correctif : « overflow-hidden » devient « overflow-x-auto » sur le cadre du tableau des bijoux (le cadre garde ses coins
// arrondis). Le tableau des codes promo, qui a le meme cadre, n'est PAS modifie.
//
// Modifie : pages/admin.js (uniquement). Tout ou rien : le repere doit exister UNE SEULE fois, sinon rien n'est ecrit.
// Fins de ligne (CRLF/LF) conservees. Relancer apres succes est refuse.
//
// Usage : node scripts/patch-fix-bijoux-scroll-mobile.mjs
// ============================================================
import fs from "node:fs";
import path from "node:path";

const TAG = "[patch-fix-bijoux-scroll-mobile]";
const FILE = "pages/admin.js";
const MARKER = "ZENORIA_ADMIN_BIJOUX_SCROLL_V1";
const full = path.join(process.cwd(), FILE);

if (!fs.existsSync(full)) {
  console.error(TAG + " " + FILE + " : fichier introuvable (lancer le script depuis le dossier du projet). RIEN n a ete ecrit.");
  process.exit(1);
}
const raw = fs.readFileSync(full, "utf8");
const crlf = raw.includes("\r\n");
const text = raw.replace(/\r\n/g, "\n");

if (text.includes(MARKER)) {
  console.error(TAG + " " + FILE + " : deja patche (" + MARKER + " present), rien a faire. RIEN n a ete ecrit.");
  process.exit(1);
}

// Cadre + debut du tableau des bijoux (la premiere colonne « Bijou » le distingue du tableau des codes promo).
const anchor = /overflow-hidden">\s*<table className="w-full text-sm">\s*<thead>\s*<tr className="bg-\[#f5edf1\] text-left text-\[#8b737e\]">\s*<th className="px-4 py-3 font-medium">Bijou<\/th>/g;
const found = text.match(anchor) || [];
if (found.length !== 1) {
  console.error(TAG + " repere du tableau des bijoux trouve " + found.length + " fois (attendu : 1). RIEN n a ete ecrit.");
  process.exit(1);
}
const replacement = 'overflow-x-auto" data-testid="products-table-scroll"> {/* ' + MARKER + " : le tableau defile horizontalement sur mobile (avant : overflow-hidden coupait les colonnes Statut et Actions) */}";
const patched = text.replace(anchor, (m) => m.replace('overflow-hidden">', () => replacement));
if (patched === text || !patched.includes(MARKER)) {
  console.error(TAG + " le remplacement n'a rien change. RIEN n a ete ecrit.");
  process.exit(1);
}
fs.writeFileSync(full, crlf ? patched.replace(/\n/g, "\r\n") : patched, "utf8");
console.log(TAG + " 1 fichier mis a jour : " + FILE + " (" + (crlf ? "CRLF" : "LF") + ")");
