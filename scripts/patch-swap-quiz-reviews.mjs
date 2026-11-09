#!/usr/bin/env node
// ============================================================
// patch-swap-quiz-reviews.mjs
// ZENORIA_SWAP_QUIZ_REVIEWS_V1
//
// Inverse l'ordre de deux sections de l'accueil (pages/index.js) :
// avant -> Avis clientes, puis Quiz colorimétrie
// après -> Quiz colorimétrie, puis Avis clientes
//
// Aucun contenu n'est modifié a l'interieur des deux blocs : seul leur
// ORDRE change. C'est un remplacement UNIQUE et ATOMIQUE (reviews+quiz
// -> quiz+reviews) : il n'existe jamais d'etat intermediaire incoherent.
//
// Usage : node scripts/patch-swap-quiz-reviews.mjs
// Idempotent : si deja applique (quiz avant reviews), ne fait rien.
// Si l'ancre ne correspond pas EXACTEMENT, le script s'arrete SANS
// RIEN ECRIRE.
// ============================================================
import fs from "node:fs";
import path from "node:path";

const MARK = "ZENORIA_SWAP_QUIZ_REVIEWS_V1";
const FILE = path.join(process.cwd(), "pages", "index.js");

function fail(message) {
  console.error(`[patch-swap-quiz-reviews] ${message}`);
  process.exit(1);
}

if (!fs.existsSync(FILE)) {
  fail(`fichier introuvable : ${FILE} (lancez le script depuis la racine du projet)`);
}

const original = fs.readFileSync(FILE, "utf8");
const usesCRLF = original.includes("\r\n");
const content = original.replace(/\r\n/g, "\n");

const reviewsBlock =
  "        {/* AVIS CLIENTES : visibles si l'interrupteur est sur ON, ou en aperçu pour l'administration */}\n" +
  "        {(reviewsCfg.enabled || isAdmin) && <ReviewsSection reviewsCfg={reviewsCfg} isAdmin={isAdmin} products={products} />}\n";

const quizBlock =
  '        {/* QUIZ COULEURS (invitation) : la page du quiz est /quiz */}\n' +
  '        <section id="quiz" className="max-w-6xl mx-auto px-6 py-20">\n' +
  '          <div className="rounded-[2.5rem] p-8 md:p-12 grid lg:grid-cols-[1.2fr_.8fr] gap-10 items-center" style={{ background: "linear-gradient(120deg,#eee3f5,#f6e3df)" }}>\n' +
  '            <div>\n' +
  '              <div className="text-xs tracking-[.3em] text-[#956d83] uppercase mb-3">Quiz colorimétrie</div>\n' +
  '              <h2 className="font-serif text-4xl mb-4">{siteTexts.quiz_title}</h2>\n' +
  '              <p className="text-[#6d6068] leading-7 mb-6">\n' +
  '                <TextLines text={siteTexts.quiz_text} />\n' +
  '              </p>\n' +
  '              <a\n' +
  '                href="/quiz"\n' +
  '                data-testid="teaser-quiz-link"\n' +
  '                className="inline-flex items-center gap-2 rounded-full bg-[#8d5e74] hover:bg-[#7a4e63] text-white px-7 h-12 text-sm font-medium transition"\n' +
  '              >\n' +
  '                Lancer le quiz <ArrowRight size={16} />\n' +
  '              </a>\n' +
  '              <div className="text-xs text-[#8b737e] mt-3">3 choix · moins de 2 minutes · rien n&apos;est enregistré</div>\n' +
  '            </div>\n' +
  '            <div className="max-w-[260px] mx-auto w-full">\n' +
  '              <Mannequin hair="#8b6a4a" eye="#8a5a2b" skin="#e0b184" garment="#c8643b" decorative />\n' +
  '            </div>\n' +
  '          </div>\n' +
  '        </section>\n';

// --- Déjà appliqué (quiz suivi directement de reviews) ? ---
const alreadySwapped = content.includes(quizBlock + reviewsBlock);
if (alreadySwapped) {
  console.log("[patch-swap-quiz-reviews] déjà appliqué (le quiz précède déjà les avis), rien à faire.");
  process.exit(0);
}

// --- Ancre d'origine : reviews immédiatement suivi de quiz ---
const anchor = reviewsBlock + quizBlock;
const count = content.split(anchor).length - 1;
if (count !== 1) {
  fail(
    `ancre introuvable (ou en double) dans pages/index.js : trouvée ${count} fois au lieu de 1. ` +
    `Fichier modifié depuis, ou texte différent de ce qui a été vérifié. Rien n'a été écrit. ` +
    `Envoyez le texte exact autour de "AVIS CLIENTES" et "QUIZ COULEURS" pour corriger l'ancre.`
  );
}

const replacement = quizBlock + reviewsBlock;
const updated = content.replace(anchor, () => replacement);

fs.writeFileSync(FILE, usesCRLF ? updated.replace(/\n/g, "\r\n") : updated, "utf8");

console.log("[patch-swap-quiz-reviews] pages/index.js mis à jour :");
console.log("[patch-swap-quiz-reviews]   - ordre inversé : le Quiz colorimétrie précède désormais les Avis clientes");
console.log("[patch-swap-quiz-reviews] Aucun contenu interne modifié, uniquement la position des deux blocs.");
