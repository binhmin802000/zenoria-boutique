#!/usr/bin/env node
// ============================================================
// patch-lotA1-ancres.mjs  -  ZENORIA_ANCHORS_V1
//
// Lot A1 : les entrees du menu (Bijoux, Les saisons, Savoir-faire, Notre histoire, Notre philosophie, Contact)
// arrivent sous le header collant de 80 px (h-20) au lieu d'etre cachees derriere, et « Contact » mene
// au pied de page (bloc « Nous contacter ») au lieu de la newsletter.
//
//  - components/Footer.js      : <footer> recoit id="contact"
//  - pages/index.js            : la newsletter passe de id="contact" a id="newsletter" (evite le doublon d'id) ;
//                                scroll-mt-20 sur seasons, collections et philosophie
//  - components/SavoirFaire.js : scroll-mt-20 sur savoir-faire
//  - components/StorySection.js: scroll-mt-24 devient scroll-mt-20 (meme position que les autres)
//
// Utilisation (depuis la racine du projet) :
//   node scripts/patch-lotA1-ancres.mjs --dry-run   (controle les ancres, n'ecrit rien)
//   node scripts/patch-lotA1-ancres.mjs             (applique)
//
// Le script s'arrete sans rien ecrire si une ancre est absente ou en double.
// ============================================================
import fs from "node:fs";
import path from "node:path";

const DRY = process.argv.includes("--dry-run");
const ROOT = process.cwd();

function stop(msg) {
  console.error("\nARRET : " + msg + "\nRien n'a ete ecrit.");
  process.exit(1);
}
const count = (s, sub) => s.split(sub).length - 1;

const EDITS = [
  {
    file: "pages/index.js",
    changes: [
      {
        label: "seasons : scroll-mt-20",
        from: '<section id="seasons" className="relative overflow-hidden">',
        to: '<section id="seasons" className="relative overflow-hidden scroll-mt-20">',
      },
      {
        label: "collections : scroll-mt-20",
        from: '<section id="collections" className="py-20 bg-white">',
        to: '<section id="collections" className="py-20 bg-white scroll-mt-20">',
      },
      {
        label: "philosophie : scroll-mt-20",
        from: '<section id="philosophie" className="grid grid-cols-1 lg:grid-cols-2 min-h-[540px]">',
        to: '<section id="philosophie" className="grid grid-cols-1 lg:grid-cols-2 min-h-[540px] scroll-mt-20">',
      },
      {
        label: "newsletter : id contact -> newsletter",
        from: '<section id="contact" className="bg-[#d9c5cc] py-16">',
        to: '<section id="newsletter" className="bg-[#d9c5cc] py-16">',
      },
    ],
  },
  {
    file: "components/Footer.js",
    changes: [
      {
        label: "pied de page : id=\"contact\"",
        from: '<footer className="bg-[#2f252d] text-white/70 py-12">',
        to: '<footer id="contact" className="bg-[#2f252d] text-white/70 py-12">',
      },
    ],
  },
  {
    file: "components/SavoirFaire.js",
    changes: [
      {
        label: "savoir-faire : scroll-mt-20",
        from: '<section id="savoir-faire" className="bg-[#fbf8f4] py-24">',
        to: '<section id="savoir-faire" className="bg-[#fbf8f4] py-24 scroll-mt-20">',
      },
    ],
  },
  {
    file: "components/StorySection.js",
    changes: [
      {
        label: "notre-histoire : scroll-mt-24 -> scroll-mt-20",
        from: '<section id="notre-histoire" ref={ref} data-testid="story-section" className="max-w-3xl mx-auto px-6 py-20 scroll-mt-24 text-center">',
        to: '<section id="notre-histoire" ref={ref} data-testid="story-section" className="max-w-3xl mx-auto px-6 py-20 scroll-mt-20 text-center">',
      },
    ],
  },
];

// ---------- Controles (rien n'est ecrit avant que tout soit valide) ----------
const plan = [];
for (const e of EDITS) {
  const p = path.join(ROOT, ...e.file.split("/"));
  if (!fs.existsSync(p)) stop(e.file + " introuvable (lance le script depuis la racine du projet).");
  let src = fs.readFileSync(p, "utf8");
  for (const c of e.changes) {
    const n = count(src, c.from);
    if (n !== 1) {
      const already = count(src, c.to);
      stop(e.file + " : ancre « " + c.label + " » trouvee " + n + " fois (attendu : 1)" + (already === 1 ? " ; la version modifiee est deja presente (lot deja applique ?)." : "."));
    }
    src = src.replace(c.from, () => c.to);
  }
  plan.push({ file: e.file, path: p, next: src, n: e.changes.length });
}

// Controle final : un seul id="contact" dans les fichiers modifies (le pied de page), aucun doublon
const contactIds = plan.reduce((t, f) => t + count(f.next, 'id="contact"'), 0);
if (contactIds !== 1) stop('apres modification, id="contact" apparait ' + contactIds + " fois dans les fichiers modifies (attendu : 1, dans Footer.js).");
const indexNext = plan.find((f) => f.file === "pages/index.js").next;
if (count(indexNext, 'id="newsletter"') !== 1) stop('id="newsletter" absent ou en double dans pages/index.js.');

console.log("Lot A1 - ancres du menu");
for (const f of plan) console.log(" - " + f.file + " : " + f.n + " modification" + (f.n > 1 ? "s" : ""));

if (DRY) {
  console.log("\nDRY-RUN OK : toutes les ancres sont uniques et conformes. Rien n'a ete ecrit.");
  process.exit(0);
}
for (const f of plan) fs.writeFileSync(f.path, f.next, "utf8");
console.log("\nOK : fichiers ecrits. Lance maintenant : npm run build");
